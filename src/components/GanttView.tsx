import React, { useMemo } from 'react';
import { Box, Typography, Tooltip, Chip } from '@mui/material';
import { useProjectStore } from '../store/projectStore';
import { useAppStore } from '../store/appStore';
import { Task } from '../db/db';
import { computeCriticalPath } from '../utils/criticalPath';

const DAY_MS = 86_400_000;
const DAY_W = 28;       // px per day column
const ROW_H = 44;       // px per task row
const LABEL_W = 240;    // px for sticky task-name column
const HEADER_H = 56;    // px for the date header
const COLOR_NORMAL = '#0052cc';
const COLOR_CRITICAL = '#c62828';

type ScheduledTask = Task & { startDate: number; duration: number };

const toDateStr = (ts: number) => new Date(ts).toLocaleDateString();

const GanttView: React.FC = () => {
  const tasks = useProjectStore(s => s.tasks);
  const openTaskModal = useAppStore(s => s.openTaskModal);

  const { scheduled, unscheduled } = useMemo(() => {
    const scheduled: ScheduledTask[] = [];
    const unscheduled: Task[] = [];
    for (const t of tasks) {
      if (t.startDate && t.duration) scheduled.push(t as ScheduledTask);
      else unscheduled.push(t);
    }
    // Sort scheduled by start date
    scheduled.sort((a, b) => a.startDate - b.startDate);
    return { scheduled, unscheduled };
  }, [tasks]);

  const criticalSet = useMemo(() => computeCriticalPath(scheduled), [scheduled]);

  // Timeline bounds — pad 3 days on each side
  const { timelineStart, totalDays } = useMemo(() => {
    if (scheduled.length === 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return { timelineStart: today.getTime(), totalDays: 30 };
    }
    const earliest = Math.min(...scheduled.map(t => t.startDate));
    const latest = Math.max(...scheduled.map(t => t.startDate + t.duration * DAY_MS));
    const start = new Date(earliest - 3 * DAY_MS);
    start.setHours(0, 0, 0, 0);
    return {
      timelineStart: start.getTime(),
      totalDays: Math.ceil((latest + 3 * DAY_MS - start.getTime()) / DAY_MS),
    };
  }, [scheduled]);

  const totalWidth = LABEL_W + totalDays * DAY_W;

  // Day array and month groups for the header
  const days = useMemo(() =>
    Array.from({ length: totalDays }, (_, i) => new Date(timelineStart + i * DAY_MS)),
    [timelineStart, totalDays]
  );

  const months = useMemo(() => {
    const groups: { label: string; count: number }[] = [];
    for (const d of days) {
      const label = d.toLocaleString('default', { month: 'short', year: '2-digit' });
      if (!groups.length || groups[groups.length - 1].label !== label) {
        groups.push({ label, count: 1 });
      } else {
        groups[groups.length - 1].count++;
      }
    }
    return groups;
  }, [days]);

  // Bar geometry helpers (coordinates relative to the bar area, i.e. after LABEL_W)
  const barLeft = (t: ScheduledTask) => (t.startDate - timelineStart) / DAY_MS * DAY_W;
  const barWidth = (t: ScheduledTask) => Math.max(t.duration * DAY_W, 6);

  // Row index map for arrow drawing
  const rowOf = useMemo(() => {
    const m = new Map<string, number>();
    scheduled.forEach((t, i) => m.set(t.id, i));
    return m;
  }, [scheduled]);

  // Dependency arrows — SVG paths in bar-area coordinate space
  const arrows = useMemo(() => {
    const paths: { d: string; critical: boolean }[] = [];
    for (const task of scheduled) {
      if (!task.dependencies?.length) continue;
      const x2 = barLeft(task);
      const row2 = rowOf.get(task.id);
      if (row2 === undefined) continue;
      const y2 = row2 * ROW_H + ROW_H / 2;

      for (const depId of task.dependencies) {
        const dep = scheduled.find(t => t.id === depId);
        if (!dep) continue;
        const row1 = rowOf.get(depId);
        if (row1 === undefined) continue;
        const x1 = barLeft(dep) + barWidth(dep);
        const y1 = row1 * ROW_H + ROW_H / 2;
        const elbow = Math.max((x2 - x1) / 2, 12);
        const midX = x1 + elbow;
        const d = `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`;
        const critical = criticalSet.has(task.id) && criticalSet.has(depId);
        paths.push({ d, critical });
      }
    }
    return paths;
  }, [scheduled, rowOf, criticalSet, timelineStart]);

  const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: 'white', color: 'rgba(0,0,0,0.87)', borderRadius: 1, overflow: 'hidden' }}>

      {/* Legend */}
      {criticalSet.size > 0 && (
        <Box sx={{ display: 'flex', gap: 2, px: 2, py: 1, borderBottom: '1px solid #e0e0e0', alignItems: 'center' }}>
          <Chip size="small" sx={{ bgcolor: COLOR_CRITICAL, color: 'white', fontWeight: 700 }} label="Critical path" />
          <Chip size="small" sx={{ bgcolor: COLOR_NORMAL, color: 'white' }} label="Normal" />
          <Typography variant="caption" color="text.secondary">
            — — dashed arrows = non-critical dependency · solid arrows = critical dependency
          </Typography>
        </Box>
      )}

      {/* Scrollable Gantt area */}
      <Box sx={{ flexGrow: 1, overflow: 'auto', position: 'relative' }}>
        <Box sx={{ minWidth: totalWidth, position: 'relative' }}>

          {/* ── Sticky header ── */}
          <Box sx={{
            display: 'flex',
            position: 'sticky',
            top: 0,
            zIndex: 10,
            bgcolor: 'white',
            borderBottom: '2px solid #e0e0e0',
            height: HEADER_H,
          }}>
            {/* Corner label cell */}
            <Box sx={{
              width: LABEL_W,
              flexShrink: 0,
              position: 'sticky',
              left: 0,
              zIndex: 12,
              bgcolor: '#f5f5f5',
              borderRight: '2px solid #e0e0e0',
              display: 'flex',
              alignItems: 'flex-end',
              px: 2,
              pb: 0.75,
            }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', letterSpacing: 0.5 }}>
                TASK
              </Typography>
            </Box>

            {/* Date columns */}
            <Box sx={{ position: 'relative', flex: 1 }}>
              {/* Month row */}
              <Box sx={{ display: 'flex', height: '50%', borderBottom: '1px solid #e0e0e0' }}>
                {months.map((m, i) => (
                  <Box key={i} sx={{
                    width: m.count * DAY_W,
                    flexShrink: 0,
                    borderRight: '1px solid #ddd',
                    display: 'flex',
                    alignItems: 'center',
                    px: 1,
                    overflow: 'hidden',
                  }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', whiteSpace: 'nowrap' }}>
                      {m.label}
                    </Typography>
                  </Box>
                ))}
              </Box>
              {/* Day row */}
              <Box sx={{ display: 'flex', height: '50%' }}>
                {days.map((d, i) => (
                  <Box key={i} sx={{
                    width: DAY_W,
                    flexShrink: 0,
                    borderRight: '1px solid #f0f0f0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: isWeekend(d) ? '#f5f5f5' : 'transparent',
                  }}>
                    <Typography variant="caption" sx={{ fontSize: '0.6rem', color: isWeekend(d) ? 'text.disabled' : 'text.secondary' }}>
                      {d.getDate()}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Box>
          </Box>

          {/* ── Scheduled task rows ── */}
          {scheduled.map((task, i) => {
            const isCritical = criticalSet.has(task.id);
            const left = barLeft(task);
            const width = barWidth(task);
            const endDate = new Date(task.startDate + task.duration * DAY_MS);
            const rowBg = i % 2 === 0 ? '#fafafa' : '#ffffff';

            return (
              <Box
                key={task.id}
                sx={{
                  display: 'flex',
                  height: ROW_H,
                  bgcolor: rowBg,
                  borderBottom: '1px solid #f0f0f0',
                  '&:hover': { bgcolor: '#e8f0fe' },
                }}
              >
                {/* Sticky label */}
                <Box
                  onClick={() => openTaskModal(task.id)}
                  sx={{
                    width: LABEL_W,
                    flexShrink: 0,
                    position: 'sticky',
                    left: 0,
                    zIndex: 2,
                    bgcolor: rowBg,
                    borderRight: '1px solid #e0e0e0',
                    display: 'flex',
                    alignItems: 'center',
                    px: 2,
                    gap: 1,
                    cursor: 'pointer',
                    overflow: 'hidden',
                  }}
                >
                  {isCritical && (
                    <Box sx={{ width: 3, height: 22, borderRadius: '2px', bgcolor: COLOR_CRITICAL, flexShrink: 0 }} />
                  )}
                  <Box sx={{ overflow: 'hidden' }}>
                    <Typography variant="body2" noWrap sx={{ fontWeight: isCritical ? 700 : 400 }}>
                      {task.title}
                    </Typography>
                    <Typography variant="caption" color="text.disabled" noWrap>
                      {task.duration}d · {task.assigneeId ? '' : 'Unassigned'}
                    </Typography>
                  </Box>
                </Box>

                {/* Bar area */}
                <Box sx={{ flex: 1, position: 'relative', overflow: 'visible' }}>
                  {/* Weekend column shading */}
                  {days.map((d, di) => isWeekend(d) && (
                    <Box key={di} sx={{
                      position: 'absolute',
                      left: di * DAY_W,
                      top: 0,
                      width: DAY_W,
                      height: '100%',
                      bgcolor: 'rgba(0,0,0,0.025)',
                      pointerEvents: 'none',
                    }} />
                  ))}

                  {/* Task bar */}
                  <Tooltip
                    title={`${task.title}  ·  ${toDateStr(task.startDate)} → ${toDateStr(endDate.getTime())}  ·  ${task.duration} day${task.duration !== 1 ? 's' : ''}${isCritical ? '  ⚠ Critical path' : ''}`}
                    arrow
                  >
                    <Box
                      onClick={() => openTaskModal(task.id)}
                      sx={{
                        position: 'absolute',
                        left,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        width,
                        height: 26,
                        bgcolor: isCritical ? COLOR_CRITICAL : COLOR_NORMAL,
                        borderRadius: '4px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        px: 0.75,
                        overflow: 'hidden',
                        boxShadow: isCritical ? '0 0 0 2px rgba(198,40,40,0.3)' : 'none',
                        '&:hover': { filter: 'brightness(1.12)' },
                        transition: 'filter 0.15s',
                      }}
                    >
                      {width > 40 && (
                        <Typography variant="caption" sx={{ color: 'white', fontWeight: 600, whiteSpace: 'nowrap', fontSize: '0.65rem' }}>
                          {task.title}
                        </Typography>
                      )}
                    </Box>
                  </Tooltip>
                </Box>
              </Box>
            );
          })}

          {/* ── Unscheduled section ── */}
          {unscheduled.length > 0 && (
            <>
              <Box sx={{
                display: 'flex',
                height: 30,
                bgcolor: '#f0f0f0',
                borderTop: '2px solid #e0e0e0',
                borderBottom: '1px solid #e0e0e0',
                alignItems: 'center',
                position: 'sticky',
                left: 0,
              }}>
                <Box sx={{ width: LABEL_W, flexShrink: 0, position: 'sticky', left: 0, bgcolor: '#f0f0f0', px: 2 }}>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', letterSpacing: 0.5 }}>
                    UNSCHEDULED ({unscheduled.length})
                  </Typography>
                </Box>
                <Typography variant="caption" sx={{ color: 'text.disabled', px: 2 }}>
                  Set a start date and duration to place these on the chart
                </Typography>
              </Box>
              {unscheduled.map((task, i) => {
                const unschedBg = i % 2 === 0 ? '#fafafa' : '#ffffff';
                return (
                <Box key={task.id} sx={{
                  display: 'flex',
                  height: ROW_H,
                  bgcolor: unschedBg,
                  borderBottom: '1px solid #f0f0f0',
                  '&:hover': { bgcolor: '#e8f0fe' },
                }}>
                  <Box
                    onClick={() => openTaskModal(task.id)}
                    sx={{
                      width: LABEL_W,
                      flexShrink: 0,
                      position: 'sticky',
                      left: 0,
                      zIndex: 2,
                      bgcolor: unschedBg,
                      borderRight: '1px solid #e0e0e0',
                      display: 'flex',
                      alignItems: 'center',
                      px: 2,
                      cursor: 'pointer',
                      overflow: 'hidden',
                    }}
                  >
                    <Typography variant="body2" noWrap sx={{ color: 'text.secondary' }}>{task.title}</Typography>
                  </Box>
                  <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', px: 2 }}>
                    <Typography variant="caption" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>
                      No start date or duration — click to edit
                    </Typography>
                  </Box>
                </Box>
                );
              })}
            </>
          )}

          {/* ── SVG dependency arrows (positioned over bar area) ── */}
          {arrows.length > 0 && (
            <svg
              style={{
                position: 'absolute',
                top: HEADER_H,
                left: LABEL_W,
                width: totalDays * DAY_W,
                height: scheduled.length * ROW_H,
                pointerEvents: 'none',
                overflow: 'visible',
              }}
            >
              <defs>
                <marker id="arr-n" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                  <path d="M0,0 L7,3.5 L0,7 Z" fill={COLOR_NORMAL} opacity="0.7" />
                </marker>
                <marker id="arr-c" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                  <path d="M0,0 L7,3.5 L0,7 Z" fill={COLOR_CRITICAL} />
                </marker>
              </defs>
              {arrows.map((arrow, i) => (
                <path
                  key={i}
                  d={arrow.d}
                  fill="none"
                  stroke={arrow.critical ? COLOR_CRITICAL : COLOR_NORMAL}
                  strokeWidth={arrow.critical ? 2 : 1.5}
                  strokeOpacity={arrow.critical ? 1 : 0.65}
                  strokeDasharray={arrow.critical ? undefined : '5 3'}
                  markerEnd={arrow.critical ? 'url(#arr-c)' : 'url(#arr-n)'}
                />
              ))}
            </svg>
          )}

          {/* Empty state */}
          {scheduled.length === 0 && unscheduled.length === 0 && (
            <Box sx={{ p: 6, textAlign: 'center' }}>
              <Typography color="text.secondary">No tasks yet. Create tasks and set start dates to build your Gantt chart.</Typography>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default GanttView;

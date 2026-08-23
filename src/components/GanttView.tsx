import React, { useMemo, useState } from 'react';
import { Box, Typography, Tooltip, Chip, IconButton } from '@mui/material';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { useProjectStore } from '../store/projectStore';
import { useAppStore } from '../store/appStore';
import { Task } from '../db/db';
import { computeCriticalPath } from '../utils/criticalPath';
import { buildTaskTree, flattenTreeExpanded, TaskNode } from '../utils/taskTree';

const DAY_MS = 86_400_000;
const DAY_W = 28;
const ROW_H = 44;
const LABEL_W = 260;
const HEADER_H = 56;
const COLOR_NORMAL = '#0052cc';
const COLOR_CRITICAL = '#c62828';
const COLOR_SUMMARY = '#546e7a';  // parent/summary task bar color

type ScheduledTask = Task & { startDate: number; duration: number; isSummary?: boolean };

const toDateStr = (ts: number) => new Date(ts).toLocaleDateString();

const GanttView: React.FC = () => {
  const tasks = useProjectStore(s => s.tasks);
  const releases = useProjectStore(s => s.releases);
  const openTaskModal = useAppStore(s => s.openTaskModal);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggle = (id: string) => setExpandedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  // Build task tree so we respect hierarchy in ordering
  const tree = useMemo(() => buildTaskTree(tasks), [tasks]);
  const flatNodes = useMemo(() => flattenTreeExpanded(tree, expandedIds), [tree, expandedIds]);

  // For each node, compute its display schedule.
  // Explicit startDate + duration → use as-is.
  // No dates but has scheduled descendants → auto-span (summary bar).
  // Neither → unscheduled.
  const getDescendantTasks = (node: TaskNode): Task[] => {
    const result: Task[] = [];
    const walk = (n: TaskNode) => { result.push(n.task); n.children.forEach(walk); };
    node.children.forEach(walk);
    return result;
  };

  const { displayRows, unscheduledNodes } = useMemo(() => {
    const displayRows: { node: TaskNode; scheduled: ScheduledTask }[] = [];
    const unscheduledNodes: TaskNode[] = [];

    for (const node of flatNodes) {
      const { task } = node;
      if (task.startDate && task.duration) {
        displayRows.push({ node, scheduled: task as ScheduledTask });
      } else {
        // Try auto-span from descendants
        const descendants = getDescendantTasks(node);
        const withDates = descendants.filter(d => d.startDate && d.duration) as ScheduledTask[];
        if (withDates.length > 0) {
          const minStart = Math.min(...withDates.map(d => d.startDate));
          const maxEnd = Math.max(...withDates.map(d => d.startDate + d.duration * DAY_MS));
          displayRows.push({
            node,
            scheduled: {
              ...task,
              startDate: minStart,
              duration: Math.ceil((maxEnd - minStart) / DAY_MS) || 1,
              isSummary: true,
            },
          });
        } else {
          unscheduledNodes.push(node);
        }
      }
    }
    return { displayRows, unscheduledNodes };
  }, [flatNodes]);

  // CPM runs on explicitly scheduled tasks only
  const explicitlyScheduled = useMemo(
    () => tasks.filter(t => t.startDate && t.duration) as ScheduledTask[],
    [tasks]
  );
  const criticalSet = useMemo(() => computeCriticalPath(explicitlyScheduled), [explicitlyScheduled]);

  // Timeline bounds
  const { timelineStart, totalDays } = useMemo(() => {
    const allScheduled = displayRows.map(r => r.scheduled);
    if (allScheduled.length === 0) {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      return { timelineStart: today.getTime(), totalDays: 30 };
    }
    const earliest = Math.min(...allScheduled.map(t => t.startDate));
    const latest = Math.max(...allScheduled.map(t => t.startDate + t.duration * DAY_MS));
    const start = new Date(earliest - 3 * DAY_MS);
    start.setHours(0, 0, 0, 0);
    return {
      timelineStart: start.getTime(),
      totalDays: Math.ceil((latest + 3 * DAY_MS - start.getTime()) / DAY_MS),
    };
  }, [displayRows]);

  const totalWidth = LABEL_W + totalDays * DAY_W;

  const days = useMemo(() =>
    Array.from({ length: totalDays }, (_, i) => new Date(timelineStart + i * DAY_MS)),
    [timelineStart, totalDays]
  );

  const months = useMemo(() => {
    const groups: { label: string; count: number }[] = [];
    for (const d of days) {
      const label = d.toLocaleString('default', { month: 'short', year: '2-digit' });
      if (!groups.length || groups[groups.length - 1].label !== label)
        groups.push({ label, count: 1 });
      else groups[groups.length - 1].count++;
    }
    return groups;
  }, [days]);

  const barLeft = (t: ScheduledTask) => (t.startDate - timelineStart) / DAY_MS * DAY_W;
  const barWidth = (t: ScheduledTask) => Math.max(t.duration * DAY_W, 6);

  // Row index map for arrow drawing (only explicitly scheduled, non-summary rows)
  const rowOf = useMemo(() => {
    const m = new Map<string, number>();
    displayRows.forEach((r, i) => m.set(r.node.task.id, i));
    return m;
  }, [displayRows]);

  const arrows = useMemo(() => {
    const paths: { d: string; critical: boolean }[] = [];
    for (const { node, scheduled } of displayRows) {
      if (!node.task.dependencies?.length || scheduled.isSummary) continue;
      const x2 = barLeft(scheduled);
      const row2 = rowOf.get(node.task.id);
      if (row2 === undefined) continue;
      const y2 = row2 * ROW_H + ROW_H / 2;

      for (const depId of node.task.dependencies) {
        const depRow = displayRows.find(r => r.node.task.id === depId);
        if (!depRow) continue;
        const row1 = rowOf.get(depId);
        if (row1 === undefined) continue;
        const x1 = barLeft(depRow.scheduled) + barWidth(depRow.scheduled);
        const y1 = row1 * ROW_H + ROW_H / 2;
        const elbow = Math.max((x2 - x1) / 2, 12);
        const d = `M ${x1} ${y1} H ${x1 + elbow} V ${y2} H ${x2}`;
        const critical = criticalSet.has(node.task.id) && criticalSet.has(depId);
        paths.push({ d, critical });
      }
    }
    return paths;
  }, [displayRows, rowOf, criticalSet, timelineStart]);

  // Release landmarks — vertical lines at the latest task end date per release
  const STATUS_COLORS: Record<string, string> = {
    'Planned':     '#1565c0',
    'In Progress': '#e65100',
    'Released':    '#2e7d32',
    'Archived':    '#757575',
  };

  const releaseLandmarks = useMemo(() => {
    return releases.flatMap(release => {
      const relTasks = tasks.filter(t => t.releaseId === release.id);
      const endDates = relTasks.flatMap(t => {
        const candidates: number[] = [];
        if (t.dueDate) candidates.push(t.dueDate);
        if (t.startDate && t.duration) candidates.push(t.startDate + t.duration * DAY_MS);
        return candidates;
      });
      if (endDates.length === 0) return [];
      const milestoneTs = Math.max(...endDates);
      const x = (milestoneTs - timelineStart) / DAY_MS * DAY_W;
      if (x < 0 || x > totalDays * DAY_W) return [];
      return [{ release, x, milestoneTs }];
    });
  }, [releases, tasks, timelineStart, totalDays]);

  const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: 'white', color: 'rgba(0,0,0,0.87)', borderRadius: 1, overflow: 'hidden' }}>

      {criticalSet.size > 0 && (
        <Box sx={{ display: 'flex', gap: 2, px: 2, py: 1, borderBottom: '1px solid #e0e0e0', alignItems: 'center', flexWrap: 'wrap' }}>
          <Chip size="small" sx={{ bgcolor: COLOR_CRITICAL, color: 'white', fontWeight: 700 }} label="Critical path" />
          <Chip size="small" sx={{ bgcolor: COLOR_NORMAL, color: 'white' }} label="Normal" />
          <Chip size="small" sx={{ bgcolor: COLOR_SUMMARY, color: 'white' }} label="Summary (auto-span)" />
          <Typography variant="caption" color="text.secondary">
            — — dashed = non-critical dependency · solid = critical
          </Typography>
        </Box>
      )}

      <Box sx={{ flexGrow: 1, overflow: 'auto', position: 'relative' }}>
        <Box sx={{ minWidth: totalWidth, position: 'relative' }}>

          {/* ── Sticky header ── */}
          <Box sx={{ display: 'flex', position: 'sticky', top: 0, zIndex: 10, bgcolor: 'white', borderBottom: '2px solid #e0e0e0', height: HEADER_H }}>
            <Box sx={{
              width: LABEL_W, flexShrink: 0, position: 'sticky', left: 0, zIndex: 12,
              bgcolor: '#f5f5f5', borderRight: '2px solid #e0e0e0',
              display: 'flex', alignItems: 'flex-end', px: 2, pb: 0.75,
            }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', letterSpacing: 0.5 }}>TASK</Typography>
            </Box>
            <Box sx={{ position: 'relative', flex: 1 }}>
              <Box sx={{ display: 'flex', height: '50%', borderBottom: '1px solid #e0e0e0' }}>
                {months.map((m, i) => (
                  <Box key={i} sx={{ width: m.count * DAY_W, flexShrink: 0, borderRight: '1px solid #ddd', display: 'flex', alignItems: 'center', px: 1, overflow: 'hidden' }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', whiteSpace: 'nowrap' }}>{m.label}</Typography>
                  </Box>
                ))}
              </Box>
              <Box sx={{ display: 'flex', height: '50%' }}>
                {days.map((d, i) => (
                  <Box key={i} sx={{ width: DAY_W, flexShrink: 0, borderRight: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: isWeekend(d) ? '#f5f5f5' : 'transparent' }}>
                    <Typography variant="caption" sx={{ fontSize: '0.6rem', color: isWeekend(d) ? 'text.disabled' : 'text.secondary' }}>{d.getDate()}</Typography>
                  </Box>
                ))}
              </Box>
            </Box>
          </Box>

          {/* ── Task rows ── */}
          {displayRows.map(({ node, scheduled }, i) => {
            const { task, children, depth } = node;
            const hasChildren = children.length > 0;
            const isCollapsed = !expandedIds.has(task.id);
            const isCritical = criticalSet.has(task.id);
            const isSummary = !!scheduled.isSummary;
            const rowBg = i % 2 === 0 ? '#fafafa' : '#ffffff';
            const left = barLeft(scheduled);
            const width = barWidth(scheduled);
            const endDate = new Date(scheduled.startDate + scheduled.duration * DAY_MS);
            const barColor = isCritical ? COLOR_CRITICAL : isSummary ? COLOR_SUMMARY : COLOR_NORMAL;
            const barH = isSummary ? 10 : 26;

            return (
              <Box key={task.id} sx={{ display: 'flex', height: ROW_H, bgcolor: rowBg, borderBottom: '1px solid #f0f0f0', '&:hover': { bgcolor: '#e8f0fe' } }}>
                {/* Sticky label */}
                <Box sx={{
                  width: LABEL_W, flexShrink: 0, position: 'sticky', left: 0, zIndex: 2,
                  bgcolor: rowBg, borderRight: '1px solid #e0e0e0',
                  display: 'flex', alignItems: 'center', pr: 1,
                  pl: 1 + depth * 2,
                }}>
                  {hasChildren ? (
                    <IconButton size="small" onClick={() => toggle(task.id)} sx={{ p: 0.25, mr: 0.5, flexShrink: 0 }}>
                      {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                    </IconButton>
                  ) : (
                    <Box sx={{ width: 22, flexShrink: 0 }} />
                  )}
                  {depth > 0 && <Box sx={{ width: 2, height: 18, bgcolor: 'divider', borderRadius: 1, mr: 0.75, flexShrink: 0 }} />}
                  <Box onClick={() => openTaskModal(task.id)} sx={{ overflow: 'hidden', cursor: 'pointer', flex: 1 }}>
                    <Typography variant="body2" noWrap sx={{ fontWeight: hasChildren ? 700 : 400 }}>
                      {task.title}
                    </Typography>
                    <Typography variant="caption" color="text.disabled" noWrap>
                      {scheduled.duration}d{isSummary ? ' (summary)' : ''}{task.assigneeId ? '' : ' · Unassigned'}
                    </Typography>
                  </Box>
                </Box>

                {/* Bar area */}
                <Box sx={{ flex: 1, position: 'relative' }}>
                  {days.map((d, di) => isWeekend(d) && (
                    <Box key={di} sx={{ position: 'absolute', left: di * DAY_W, top: 0, width: DAY_W, height: '100%', bgcolor: 'rgba(0,0,0,0.025)', pointerEvents: 'none' }} />
                  ))}
                  <Tooltip title={`${task.title}${isSummary ? ' (summary)' : ''}  ·  ${toDateStr(scheduled.startDate)} → ${toDateStr(endDate.getTime())}  ·  ${scheduled.duration}d${isCritical ? '  ⚠ Critical' : ''}`} arrow>
                    <Box
                      onClick={() => openTaskModal(task.id)}
                      sx={{
                        position: 'absolute', left, top: '50%', transform: 'translateY(-50%)',
                        width, height: barH, bgcolor: barColor, borderRadius: isSummary ? '2px' : '4px',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', px: 0.75, overflow: 'hidden',
                        boxShadow: isCritical ? `0 0 0 2px ${COLOR_CRITICAL}44` : 'none',
                        '&:hover': { filter: 'brightness(1.12)' }, transition: 'filter 0.15s',
                      }}
                    >
                      {width > 40 && !isSummary && (
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
          {unscheduledNodes.length > 0 && (
            <>
              <Box sx={{ display: 'flex', height: 30, bgcolor: '#f0f0f0', borderTop: '2px solid #e0e0e0', borderBottom: '1px solid #e0e0e0', alignItems: 'center' }}>
                <Box sx={{ width: LABEL_W, flexShrink: 0, position: 'sticky', left: 0, bgcolor: '#f0f0f0', px: 2 }}>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', letterSpacing: 0.5 }}>
                    UNSCHEDULED ({unscheduledNodes.length})
                  </Typography>
                </Box>
                <Typography variant="caption" sx={{ color: 'text.disabled', px: 2 }}>
                  Set a start date and duration to place these on the chart
                </Typography>
              </Box>
              {unscheduledNodes.map((node, i) => {
                const unschedBg = i % 2 === 0 ? '#fafafa' : '#ffffff';
                return (
                  <Box key={node.task.id} sx={{ display: 'flex', height: ROW_H, bgcolor: unschedBg, borderBottom: '1px solid #f0f0f0', '&:hover': { bgcolor: '#e8f0fe' } }}>
                    <Box
                      onClick={() => openTaskModal(node.task.id)}
                      sx={{ width: LABEL_W, flexShrink: 0, position: 'sticky', left: 0, zIndex: 2, bgcolor: unschedBg, borderRight: '1px solid #e0e0e0', display: 'flex', alignItems: 'center', px: 2, cursor: 'pointer', overflow: 'hidden', pl: 1 + node.depth * 2 }}
                    >
                      <Typography variant="body2" noWrap sx={{ color: 'text.secondary' }}>{node.task.title}</Typography>
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

          {/* ── SVG dependency arrows ── */}
          {arrows.length > 0 && (
            <svg style={{ position: 'absolute', top: HEADER_H, left: LABEL_W, width: totalDays * DAY_W, height: displayRows.length * ROW_H, pointerEvents: 'none', overflow: 'visible' }}>
              <defs>
                <marker id="arr-n" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                  <path d="M0,0 L7,3.5 L0,7 Z" fill={COLOR_NORMAL} opacity="0.7" />
                </marker>
                <marker id="arr-c" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                  <path d="M0,0 L7,3.5 L0,7 Z" fill={COLOR_CRITICAL} />
                </marker>
              </defs>
              {arrows.map((arrow, i) => (
                <path key={i} d={arrow.d} fill="none"
                  stroke={arrow.critical ? COLOR_CRITICAL : COLOR_NORMAL}
                  strokeWidth={arrow.critical ? 2 : 1.5}
                  strokeOpacity={arrow.critical ? 1 : 0.65}
                  strokeDasharray={arrow.critical ? undefined : '5 3'}
                  markerEnd={arrow.critical ? 'url(#arr-c)' : 'url(#arr-n)'}
                />
              ))}
            </svg>
          )}

          {/* ── Release landmark lines ── */}
          {releaseLandmarks.length > 0 && (
            <svg
              style={{
                position: 'absolute',
                top: 0,
                left: LABEL_W,
                width: totalDays * DAY_W,
                height: '100%',
                pointerEvents: 'none',
                overflow: 'visible',
              }}
            >
              {releaseLandmarks.map(({ release, x, milestoneTs }) => {
                const color = STATUS_COLORS[release.status] ?? '#1565c0';
                return (
                  <g key={release.id}>
                    {/* Vertical dashed line */}
                    <line
                      x1={x} y1={HEADER_H} x2={x}
                      y2={(displayRows.length + unscheduledNodes.length) * ROW_H + HEADER_H + 30}
                      stroke={color} strokeWidth={2} strokeDasharray="6 3" opacity={0.8}
                    />
                    {/* Diamond milestone marker */}
                    <polygon
                      points={`${x},${HEADER_H - 4} ${x + 6},${HEADER_H + 6} ${x},${HEADER_H + 16} ${x - 6},${HEADER_H + 6}`}
                      fill={color} opacity={0.9}
                    />
                    {/* Label pill */}
                    <foreignObject x={x + 8} y={HEADER_H} width={140} height={24}>
                      <div
                        style={{
                          background: color,
                          color: 'white',
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          padding: '2px 7px',
                          borderRadius: 10,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          display: 'inline-block',
                          maxWidth: 132,
                          lineHeight: '18px',
                        }}
                        title={`${release.name} — ${new Date(milestoneTs).toLocaleDateString()}`}
                      >
                        {release.name}
                      </div>
                    </foreignObject>
                  </g>
                );
              })}
            </svg>
          )}

          {displayRows.length === 0 && unscheduledNodes.length === 0 && (
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

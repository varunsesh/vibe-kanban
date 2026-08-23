import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Typography, Tooltip, Chip, IconButton } from '@mui/material';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { useProjectStore } from '../store/projectStore';
import { useAppStore } from '../store/appStore';
import { Task } from '../db/db';
import { computeCriticalPath } from '../utils/criticalPath';
import { buildTaskTree, flattenTreeExpanded, TaskNode } from '../utils/taskTree';

const DAY_MS = 86_400_000;
const DAY_W = 28;
const HEADER_H = 56;
const LABEL_W_INIT = 280;
const LABEL_W_MIN = 160;
const LABEL_W_MAX = 560;
const COLOR_NORMAL = '#0052cc';
const COLOR_CRITICAL = '#c62828';
const COLOR_SUMMARY = '#546e7a';
const LINE_H = 18;   // px per wrapped line
const V_PAD = 10;    // vertical padding inside row (total)
const ROW_H_MIN = 44;
const CHAR_W = 7.2;  // estimated px per character at body2

type ScheduledTask = Task & { startDate: number; duration: number; isSummary?: boolean };

const toDateStr = (ts: number) => new Date(ts).toLocaleDateString();

const estimateRowH = (title: string, depth: number, lw: number): number => {
  // Subtract: left padding (8) + chevron/spacer (22) + indent (depth*16) + depth bar (depth>0 ? 10 : 0) + right padding (8)
  const usedW = 8 + 22 + depth * 16 + (depth > 0 ? 10 : 0) + 8;
  const availW = Math.max(40, lw - usedW);
  const charsPerLine = Math.max(5, Math.floor(availW / CHAR_W));
  const titleLines = Math.max(1, Math.ceil(title.length / charsPerLine));
  // +1 for the subtitle line (duration / assignee)
  return Math.max(ROW_H_MIN, (titleLines + 1) * LINE_H + V_PAD);
};

const GanttView: React.FC = () => {
  const tasks = useProjectStore(s => s.tasks);
  const releases = useProjectStore(s => s.releases);
  const openTaskModal = useAppStore(s => s.openTaskModal);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [labelWidth, setLabelWidth] = useState(LABEL_W_INIT);
  const [isResizing, setIsResizing] = useState(false);
  const resizeDrag = useRef<{ startX: number; startW: number } | null>(null);

  const toggle = (id: string) => setExpandedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  // ── Resize handle ──────────────────────────────────────────────────────────
  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    resizeDrag.current = { startX: e.clientX, startW: labelWidth };
    setIsResizing(true);
  };

  const handleResizeMouseMove = useCallback((e: MouseEvent) => {
    if (!resizeDrag.current) return;
    const next = Math.max(LABEL_W_MIN, Math.min(LABEL_W_MAX, resizeDrag.current.startW + e.clientX - resizeDrag.current.startX));
    setLabelWidth(next);
  }, []);

  const handleResizeMouseUp = useCallback(() => {
    resizeDrag.current = null;
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', handleResizeMouseMove);
      window.addEventListener('mouseup', handleResizeMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleResizeMouseMove);
      window.removeEventListener('mouseup', handleResizeMouseUp);
    };
  }, [isResizing, handleResizeMouseMove, handleResizeMouseUp]);

  // ── Task tree ──────────────────────────────────────────────────────────────
  const tree = useMemo(() => buildTaskTree(tasks), [tasks]);
  const flatNodes = useMemo(() => flattenTreeExpanded(tree, expandedIds), [tree, expandedIds]);

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
        const withDates = getDescendantTasks(node).filter(d => d.startDate && d.duration) as ScheduledTask[];
        if (withDates.length > 0) {
          const minStart = Math.min(...withDates.map(d => d.startDate));
          const maxEnd = Math.max(...withDates.map(d => d.startDate + d.duration * DAY_MS));
          displayRows.push({ node, scheduled: { ...task, startDate: minStart, duration: Math.ceil((maxEnd - minStart) / DAY_MS) || 1, isSummary: true } });
        } else {
          unscheduledNodes.push(node);
        }
      }
    }
    return { displayRows, unscheduledNodes };
  }, [flatNodes]);

  // ── Per-row heights & cumulative offsets ───────────────────────────────────
  const rowHeights = useMemo(
    () => displayRows.map(({ node }) => estimateRowH(node.task.title, node.depth, labelWidth)),
    [displayRows, labelWidth],
  );

  const { rowOffsets, totalScheduledH } = useMemo(() => {
    const offsets: number[] = [];
    let acc = 0;
    for (const h of rowHeights) { offsets.push(acc); acc += h; }
    return { rowOffsets: offsets, totalScheduledH: acc };
  }, [rowHeights]);

  // ── CPM ───────────────────────────────────────────────────────────────────
  const explicitlyScheduled = useMemo(
    () => tasks.filter(t => t.startDate && t.duration) as ScheduledTask[],
    [tasks],
  );
  const criticalSet = useMemo(() => computeCriticalPath(explicitlyScheduled), [explicitlyScheduled]);

  // ── Timeline bounds ────────────────────────────────────────────────────────
  const { timelineStart, totalDays } = useMemo(() => {
    const allScheduled = displayRows.map(r => r.scheduled);
    const releaseDates = releases.flatMap(r => r.scheduledDate ? [r.scheduledDate] : []);
    const allDates = [
      ...allScheduled.map(t => t.startDate),
      ...allScheduled.map(t => t.startDate + t.duration * DAY_MS),
      ...releaseDates,
    ];
    if (allDates.length === 0) {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      return { timelineStart: today.getTime(), totalDays: 30 };
    }
    const earliest = Math.min(...allDates);
    const latest = Math.max(...allDates);
    const start = new Date(earliest - 3 * DAY_MS); start.setHours(0, 0, 0, 0);
    return { timelineStart: start.getTime(), totalDays: Math.ceil((latest + 7 * DAY_MS - start.getTime()) / DAY_MS) };
  }, [displayRows, releases]);

  const totalWidth = labelWidth + totalDays * DAY_W;

  const days = useMemo(
    () => Array.from({ length: totalDays }, (_, i) => new Date(timelineStart + i * DAY_MS)),
    [timelineStart, totalDays],
  );

  const months = useMemo(() => {
    const groups: { label: string; count: number }[] = [];
    for (const d of days) {
      const label = d.toLocaleString('default', { month: 'short', year: '2-digit' });
      if (!groups.length || groups[groups.length - 1].label !== label) groups.push({ label, count: 1 });
      else groups[groups.length - 1].count++;
    }
    return groups;
  }, [days]);

  const barLeft = (t: ScheduledTask) => (t.startDate - timelineStart) / DAY_MS * DAY_W;
  const barWidth = (t: ScheduledTask) => Math.max(t.duration * DAY_W, 6);

  // ── SVG arrows ─────────────────────────────────────────────────────────────
  const rowIdxOf = useMemo(() => {
    const m = new Map<string, number>();
    displayRows.forEach((r, i) => m.set(r.node.task.id, i));
    return m;
  }, [displayRows]);

  const arrows = useMemo(() => {
    const paths: { d: string; critical: boolean }[] = [];
    for (const { node, scheduled } of displayRows) {
      if (!node.task.dependencies?.length || scheduled.isSummary) continue;
      const i2 = rowIdxOf.get(node.task.id);
      if (i2 === undefined) continue;
      const x2 = barLeft(scheduled);
      const y2 = rowOffsets[i2] + rowHeights[i2] / 2;

      for (const depId of node.task.dependencies) {
        const i1 = rowIdxOf.get(depId);
        if (i1 === undefined) continue;
        const depRow = displayRows[i1];
        const x1 = barLeft(depRow.scheduled) + barWidth(depRow.scheduled);
        const y1 = rowOffsets[i1] + rowHeights[i1] / 2;
        const elbow = Math.max((x2 - x1) / 2, 12);
        paths.push({ d: `M ${x1} ${y1} H ${x1 + elbow} V ${y2} H ${x2}`, critical: criticalSet.has(node.task.id) && criticalSet.has(depId) });
      }
    }
    return paths;
  }, [displayRows, rowIdxOf, rowOffsets, rowHeights, criticalSet, timelineStart]);

  // ── Release landmarks ──────────────────────────────────────────────────────
  const STATUS_COLORS: Record<string, string> = {
    'Planned': '#1565c0', 'In Progress': '#e65100', 'Released': '#2e7d32', 'Archived': '#757575',
  };

  const releaseLandmarks = useMemo(() => {
    return releases.flatMap(release => {
      let milestoneTs: number | undefined = release.scheduledDate;
      if (!milestoneTs) {
        const endDates = tasks.filter(t => t.releaseId === release.id).flatMap(t => {
          const c: number[] = [];
          if (t.dueDate) c.push(t.dueDate);
          if (t.startDate && t.duration) c.push(t.startDate + t.duration * DAY_MS);
          return c;
        });
        if (endDates.length > 0) milestoneTs = Math.max(...endDates);
      }
      if (!milestoneTs) return [];
      const x = (milestoneTs - timelineStart) / DAY_MS * DAY_W;
      if (x < 0 || x > totalDays * DAY_W) return [];
      return [{ release, x, milestoneTs }];
    });
  }, [releases, tasks, timelineStart, totalDays]);

  const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;

  const unschedSectionH = unscheduledNodes.length > 0 ? 30 + unscheduledNodes.length * ROW_H_MIN : 0;
  const landmarkSvgH = HEADER_H + totalScheduledH + unschedSectionH + 40;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: 'white', color: 'rgba(0,0,0,0.87)', borderRadius: 1, overflow: 'hidden', userSelect: isResizing ? 'none' : 'auto' }}>

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

          {/* ── Sticky header ─────────────────────────────────────────────── */}
          <Box sx={{ display: 'flex', position: 'sticky', top: 0, zIndex: 10, bgcolor: 'white', borderBottom: '2px solid #e0e0e0', height: HEADER_H }}>
            {/* Label column header with resize handle */}
            <Box sx={{
              width: labelWidth, flexShrink: 0, position: 'sticky', left: 0, zIndex: 12,
              bgcolor: '#f5f5f5', borderRight: `2px solid ${isResizing ? '#0052cc' : '#e0e0e0'}`,
              display: 'flex', alignItems: 'flex-end', px: 2, pb: 0.75,
            }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', letterSpacing: 0.5 }}>TASK</Typography>
              {/* Drag handle */}
              <Box
                onMouseDown={handleResizeMouseDown}
                sx={{
                  position: 'absolute', right: -3, top: 0, width: 6, height: '100%',
                  cursor: 'col-resize', zIndex: 1,
                  transition: 'background-color 0.15s',
                  '&:hover': { bgcolor: 'primary.main', opacity: 0.35 },
                  ...(isResizing && { bgcolor: 'primary.main', opacity: 0.5 }),
                }}
              />
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

          {/* ── Scheduled task rows ───────────────────────────────────────── */}
          {displayRows.map(({ node, scheduled }, i) => {
            const { task, children, depth } = node;
            const hasChildren = children.length > 0;
            const isCollapsed = !expandedIds.has(task.id);
            const isCritical = criticalSet.has(task.id);
            const isSummary = !!scheduled.isSummary;
            const rowBg = i % 2 === 0 ? '#fafafa' : '#ffffff';
            const left = barLeft(scheduled);
            const width = barWidth(scheduled);
            const endDate = scheduled.startDate + scheduled.duration * DAY_MS;
            const barColor = isCritical ? COLOR_CRITICAL : isSummary ? COLOR_SUMMARY : COLOR_NORMAL;
            const barH = isSummary ? 10 : 26;
            const rh = rowHeights[i];

            return (
              <Box key={task.id} sx={{ display: 'flex', height: rh, minHeight: ROW_H_MIN, bgcolor: rowBg, borderBottom: '1px solid #f0f0f0', '&:hover': { bgcolor: '#e8f0fe' } }}>
                {/* Sticky label */}
                <Box sx={{
                  width: labelWidth, flexShrink: 0, position: 'sticky', left: 0, zIndex: 2,
                  bgcolor: rowBg, borderRight: '1px solid #e0e0e0',
                  display: 'flex', alignItems: 'flex-start', pt: '10px', pr: 1,
                  pl: `${8 + depth * 16}px`,
                }}>
                  {hasChildren ? (
                    <IconButton size="small" onClick={() => toggle(task.id)} sx={{ p: 0.25, mr: 0.5, flexShrink: 0, mt: '-2px' }}>
                      {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                    </IconButton>
                  ) : (
                    <Box sx={{ width: 22, flexShrink: 0 }} />
                  )}
                  {depth > 0 && <Box sx={{ width: 2, height: 18, bgcolor: 'divider', borderRadius: 1, mr: 1, flexShrink: 0, mt: '1px' }} />}
                  <Box onClick={() => openTaskModal(task.id)} sx={{ cursor: 'pointer', flex: 1, minWidth: 0 }}>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: hasChildren ? 700 : 400,
                        wordBreak: 'break-word',
                        whiteSpace: 'normal',
                        lineHeight: `${LINE_H}px`,
                      }}
                    >
                      {task.title}
                    </Typography>
                    <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: '2px', lineHeight: `${LINE_H}px` }}>
                      {scheduled.duration}d{isSummary ? ' (summary)' : ''}{task.assigneeId ? '' : ' · Unassigned'}
                    </Typography>
                  </Box>
                </Box>

                {/* Bar area */}
                <Box sx={{ flex: 1, position: 'relative' }}>
                  {days.map((d, di) => isWeekend(d) && (
                    <Box key={di} sx={{ position: 'absolute', left: di * DAY_W, top: 0, width: DAY_W, height: '100%', bgcolor: 'rgba(0,0,0,0.025)', pointerEvents: 'none' }} />
                  ))}
                  <Tooltip title={`${task.title}${isSummary ? ' (summary)' : ''}  ·  ${toDateStr(scheduled.startDate)} → ${toDateStr(endDate)}  ·  ${scheduled.duration}d${isCritical ? '  ⚠ Critical' : ''}`} arrow>
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

          {/* ── Unscheduled section ───────────────────────────────────────── */}
          {unscheduledNodes.length > 0 && (
            <>
              <Box sx={{ display: 'flex', height: 30, bgcolor: '#f0f0f0', borderTop: '2px solid #e0e0e0', borderBottom: '1px solid #e0e0e0', alignItems: 'center' }}>
                <Box sx={{ width: labelWidth, flexShrink: 0, position: 'sticky', left: 0, bgcolor: '#f0f0f0', px: 2 }}>
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
                const rh = estimateRowH(node.task.title, node.depth, labelWidth);
                return (
                  <Box key={node.task.id} sx={{ display: 'flex', minHeight: ROW_H_MIN, height: rh, bgcolor: unschedBg, borderBottom: '1px solid #f0f0f0', '&:hover': { bgcolor: '#e8f0fe' } }}>
                    <Box
                      onClick={() => openTaskModal(node.task.id)}
                      sx={{
                        width: labelWidth, flexShrink: 0, position: 'sticky', left: 0, zIndex: 2,
                        bgcolor: unschedBg, borderRight: '1px solid #e0e0e0',
                        display: 'flex', alignItems: 'flex-start', pt: '10px', cursor: 'pointer',
                        pl: `${8 + 22 + node.depth * 16 + (node.depth > 0 ? 10 : 0)}px`, pr: 1,
                      }}
                    >
                      <Typography
                        variant="body2"
                        sx={{ color: 'text.secondary', wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: `${LINE_H}px` }}
                      >
                        {node.task.title}
                      </Typography>
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

          {/* ── SVG dependency arrows ─────────────────────────────────────── */}
          {arrows.length > 0 && (
            <svg style={{ position: 'absolute', top: HEADER_H, left: labelWidth, width: totalDays * DAY_W, height: totalScheduledH, pointerEvents: 'none', overflow: 'visible' }}>
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

          {/* ── Release landmark lines ────────────────────────────────────── */}
          {releaseLandmarks.length > 0 && (
            <svg
              style={{ position: 'absolute', top: 0, left: labelWidth, width: totalDays * DAY_W, height: landmarkSvgH, pointerEvents: 'none', overflow: 'visible', zIndex: 5 }}
            >
              {releaseLandmarks.map(({ release, x, milestoneTs }) => {
                const color = STATUS_COLORS[release.status] ?? '#1565c0';
                return (
                  <g key={release.id}>
                    <line x1={x} y1={HEADER_H} x2={x} y2={landmarkSvgH} stroke={color} strokeWidth={2} strokeDasharray="6 4" opacity={0.75} />
                    <polygon points={`${x},${HEADER_H + 2} ${x + 7},${HEADER_H + 12} ${x},${HEADER_H + 22} ${x - 7},${HEADER_H + 12}`} fill={color} opacity={0.95} />
                    <foreignObject x={x + 10} y={HEADER_H + 2} width={160} height={22}>
                      <div style={{ background: color, color: 'white', fontSize: '0.6rem', fontWeight: 700, padding: '2px 7px', borderRadius: 10, whiteSpace: 'nowrap', display: 'inline-block', lineHeight: '16px' }}>
                        {release.name} · {new Date(milestoneTs).toLocaleDateString()}
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

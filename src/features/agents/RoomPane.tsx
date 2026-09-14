import { useEffect, useMemo, useRef, useState } from 'react';
import { Users, Send, Square, Trash2, Settings2, MessageSquare, Plus, AlertTriangle } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@/lib/cn';
import { t } from '@/i18n';
import { formatClock } from '@/lib/format';
import { useAgents, handleOf, type CustomAgent, type Room, type RoomMessage } from '@/stores/agents';
import type { AgentActivity } from '@/types/agent';
import { useProjects } from '@/stores/projects';
import { useSessions } from '@/stores/sessions';
import { useUI } from '@/stores/ui';
import { Textarea } from '@/components/ui/Textarea';
import { Tooltip } from '@/components/ui/Tooltip';
import { Button } from '@/components/ui/Button';
import { LivingBox, LivingItem, LivingList, LivingReveal } from '@/components/ui/Living';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/DropdownMenu';
import { AnimatePresence, motion } from 'motion/react';
import { popoverTransition, popoverVariants } from '@/lib/motion';
import { Markdown } from '@/features/agent/Markdown';
import { AgentGlyph } from '@/features/agent/AgentGlyph';
import { activityWord } from '@/features/island/live';
import { AgentAvatar } from './AgentAvatar';
import { useAgentEditor } from './editor';
import { sendToRoom, stopAgent, removeRoom, nameOf } from './room-runtime';

/**
 * A room: the agents at the top with what each one is doing, the
 * conversation, and a composer where `@` offers the agents. A message goes
 * to whoever is mentioned — to everyone when nobody is — and each reply
 * shows who said it and to whom.
 */
export function RoomPane({ roomId }: { roomId: string }) {
  const room = useAgents((s) => s.rooms[roomId]);
  if (!room) return <div className="flex h-full items-center justify-center text-[12.5px] text-muted">{t('This room is gone.')}</div>;
  return <RoomView room={room} />;
}

function RoomView({ room }: { room: Room }) {
  const agents = useAgents(useShallow((s) => room.agentIds.map((id) => s.agents[id]).filter((a): a is CustomAgent => !!a)));
  const project = useProjects((s) => s.projects.find((p) => p.id === room.projectId));
  // Who is working, who needs an answer — from their sessions.
  const stateKeys = useSessions(
    useShallow((s) =>
      agents.map((a) => {
        const ses = room.sessions[a.id] ? s.sessions[room.sessions[a.id]] : undefined;
        return ses ? `${ses.status}:${ses.activity}` : '';
      }),
    ),
  );
  const states = useMemo(() => {
    const out: Record<string, { status: string; activity: AgentActivity } | null> = {};
    agents.forEach((a, i) => {
      const k = stateKeys[i];
      const [status, activity] = k ? k.split(':') : [];
      out[a.id] = status ? { status, activity: activity as AgentActivity } : null;
    });
    return out;
  }, [agents, stateKeys]);
  const [confirm, setConfirm] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const busy = agents.filter((a) => states[a.id]?.status === 'running' || states[a.id]?.status === 'waiting');

  // Follow the conversation.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [room.messages.length, busy.length]);

  const openSession = (a: CustomAgent) => {
    const sid = room.sessions[a.id];
    if (sid) useUI.getState().setActiveSession(sid);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* the room */}
      <LivingBox className="shrink-0 px-4 pb-2.5 pt-3 hairline-b">
        <LivingItem still className="flex items-center gap-2">
          <Users className="size-[14px] text-accent" />
          <span className="truncate text-[13px] font-medium text-primary">{room.name}</span>
          {project ? <span className="truncate text-[12px] text-muted">· {project.name}</span> : null}
          <span className="flex-1" />
          <Tooltip content={t('Delete room')} side="bottom">
            <button type="button" aria-label={t('Delete room')} onClick={() => setConfirm((v) => !v)} className="inline-flex size-6 items-center justify-center rounded-md text-muted press hover:bg-surface-hover hover:text-danger">
              <Trash2 className="size-[13px]" />
            </button>
          </Tooltip>
        </LivingItem>
        <LivingItem still className="mt-2 flex flex-wrap items-center gap-1.5">
          {agents.map((a) => {
            const st = states[a.id];
            const working = st?.status === 'running';
            const waiting = st?.status === 'waiting';
            return (
              <span key={a.id} className={cn('inline-flex h-7 items-center gap-1.5 rounded-full pl-1 pr-2 text-[12px] shadow-[0_0_0_1px_var(--border)]', waiting ? 'bg-warning-soft text-warning' : working ? 'bg-surface-inset text-primary' : 'bg-surface text-secondary')}>
                <AgentAvatar agent={a} size={20} />
                <span className="font-medium">{a.name}</span>
                {working ? (
                  <span className="inline-flex items-center gap-1 text-[11px] text-accent-warm">
                    <AgentGlyph active className="size-[11px]" /> {activityWord(st!.activity)}
                  </span>
                ) : waiting ? (
                  <span className="inline-flex items-center gap-1 text-[11px]">
                    <AlertTriangle className="size-[11px]" /> {t('Needs you')}
                  </span>
                ) : null}
                <span className="ml-0.5 inline-flex items-center">
                  {working || waiting ? (
                    <Tooltip content={t('Stop')} side="bottom">
                      <button type="button" aria-label={t('Stop')} onClick={() => void stopAgent(room.id, a.id)} className="inline-flex size-5 items-center justify-center rounded-full text-muted press hover:bg-surface-active hover:text-primary">
                        <Square className="size-[9px]" fill="currentColor" />
                      </button>
                    </Tooltip>
                  ) : null}
                  {room.sessions[a.id] ? (
                    <Tooltip content={t('Open its session (tools, files, permissions)')} side="bottom">
                      <button type="button" aria-label={t('Open session')} onClick={() => openSession(a)} className="inline-flex size-5 items-center justify-center rounded-full text-muted press hover:bg-surface-active hover:text-primary">
                        <MessageSquare className="size-[11px]" />
                      </button>
                    </Tooltip>
                  ) : null}
                  <Tooltip content={t('Edit agent')} side="bottom">
                    <button type="button" aria-label={t('Edit agent')} onClick={() => useAgentEditor.getState().open(a.id)} className="inline-flex size-5 items-center justify-center rounded-full text-muted press hover:bg-surface-active hover:text-primary">
                      <Settings2 className="size-[11px]" />
                    </button>
                  </Tooltip>
                </span>
              </span>
            );
          })}
          <AddAgent room={room} />
        </LivingItem>
        <LivingReveal open={confirm}>
          <div className="mt-2 flex items-center gap-2 rounded-md bg-danger-soft px-3 py-2 text-[12px] text-danger">
            <span className="min-w-0 flex-1">{t('The conversation and the agents’ sessions in this room are dropped.')}</span>
            <Button size="xs" variant="danger" type="button" onClick={() => void removeRoom(room.id)}>
              {t('Delete')}
            </Button>
            <Button size="xs" variant="ghost" type="button" onClick={() => setConfirm(false)}>
              {t('Cancel')}
            </Button>
          </div>
        </LivingReveal>
      </LivingBox>

      {/* the conversation */}
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-(--content-padding) py-4">
        {room.messages.length === 0 ? (
          <div className="mx-auto flex max-w-[520px] flex-col items-center gap-2 pt-16 text-center">
            <div className="flex -space-x-1.5">
              {agents.map((a) => (
                <AgentAvatar key={a.id} agent={a} size={28} ring />
              ))}
            </div>
            <div className="text-[13px] font-medium text-primary">{agents.map((a) => a.name).join(', ') || t('Nobody here yet')}</div>
            <div className="text-[12.5px] leading-relaxed text-secondary">{t('Say something. {handles} to talk to one of them; without a mention, everyone answers.', { handles: agents.map(handleOf).join(' · ') })}</div>
          </div>
        ) : (
          <LivingList className="flex flex-col gap-4">
            {room.messages.map((m) => (
              <LivingItem key={m.id} still>
                <Line m={m} agents={agents} />
              </LivingItem>
            ))}
            {busy.map((a) => (
              <LivingItem key={`busy:${a.id}`}>
                <div className="flex items-start gap-3">
                  <AgentAvatar agent={a} size={24} />
                  <div className="flex h-6 items-center gap-1.5 text-[12px] text-accent-warm">
                    <AgentGlyph active className="size-[12px]" /> {activityWord(states[a.id]!.activity)}
                  </div>
                </div>
              </LivingItem>
            ))}
          </LivingList>
        )}
      </div>

      <Composer room={room} agents={agents} />
    </div>
  );
}

/** One line of the room: who, to whom, when, and what. */
function Line({ m, agents }: { m: RoomMessage; agents: CustomAgent[] }) {
  const agent = agents.find((a) => a.id === m.from) ?? useAgents.getState().agents[m.from];
  const to = m.to.map((id) => agents.find((a) => a.id === id)?.name ?? nameOf(id)).filter(Boolean);
  return (
    <div className="flex items-start gap-3">
      {agent ? <AgentAvatar agent={agent} size={24} /> : <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-inverse">{t('You').slice(0, 1)}</span>}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 text-[11.5px]">
          <span className="font-medium text-primary">{agent?.name ?? t('You')}</span>
          {to.length ? <span className="text-muted">→ {to.join(', ')}</span> : null}
          <span className="text-muted">{formatClock(m.at)}</span>
        </div>
        {m.text ? (
          <div className={cn('selectable mt-1', agent ? '' : 'rounded-lg bg-surface-inset px-3 py-2 text-[13px] leading-relaxed text-primary')}>{agent ? <Markdown text={m.text} /> : <span className="whitespace-pre-wrap">{m.text}</span>}</div>
        ) : null}
        {m.error ? (
          <div className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-danger-soft px-2 py-1 text-[11.5px] text-danger">
            <AlertTriangle className="size-[11px]" /> {m.error}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** "+" adds an agent that is not in the room yet. */
function AddAgent({ room }: { room: Room }) {
  const others = useAgents(useShallow((s) => Object.values(s.agents).filter((a) => !room.agentIds.includes(a.id))));
  if (!others.length) return null;
  return (
    <DropdownMenu>
      <Tooltip content={t('Add an agent')} side="bottom">
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label={t('Add an agent')} className="inline-flex size-7 items-center justify-center rounded-full text-muted press hover:bg-surface-hover hover:text-primary data-[state=open]:bg-surface-hover data-[state=open]:text-primary">
            <Plus className="size-[13px]" />
          </button>
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent align="start">
        {others.map((a) => (
          <DropdownMenuItem key={a.id} icon={<AgentAvatar agent={a} size={16} />} onSelect={() => useAgents.getState().updateRoom(room.id, { agentIds: [...room.agentIds, a.id] })}>
            {a.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The composer: `@` offers the agents; Enter sends, Shift+Enter breaks the line. */
function Composer({ room, agents }: { room: Room; agents: CustomAgent[] }) {
  const [value, setValue] = useState('');
  const [caret, setCaret] = useState(0);
  const [index, setIndex] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);

  // The mention being typed: from the last "@" before the caret, if no space came after it.
  const token = useMemo(() => {
    const head = value.slice(0, caret);
    const at = head.lastIndexOf('@');
    if (at < 0) return null;
    const frag = head.slice(at + 1);
    if (/\s/.test(frag)) return null;
    if (at > 0 && !/\s/.test(head[at - 1])) return null;
    return { at, frag };
  }, [value, caret]);
  const matches = useMemo(() => {
    if (!token) return [];
    const q = token.frag.toLowerCase();
    // The name, its handle, or any word of the name ("@poe" finds "E2E Poeta").
    return agents.filter((a) => a.name.toLowerCase().startsWith(q) || handleOf(a).slice(1).toLowerCase().startsWith(q) || a.name.toLowerCase().split(/\s+/).some((w) => w.startsWith(q)));
  }, [token, agents]);
  const pick = (a: CustomAgent) => {
    if (!token) return;
    const before = value.slice(0, token.at);
    const after = value.slice(caret);
    const next = `${before}${handleOf(a)} ${after}`;
    setValue(next);
    const pos = before.length + handleOf(a).length + 1;
    requestAnimationFrame(() => {
      ref.current?.setSelectionRange(pos, pos);
      setCaret(pos);
    });
  };
  const send = () => {
    const text = value.trim();
    if (!text || !agents.length) return;
    sendToRoom(room.id, text);
    setValue('');
    setCaret(0);
  };
  const mentioned = agents.filter((a) => value.toLowerCase().includes(handleOf(a).toLowerCase()) || value.toLowerCase().includes('@' + a.name.toLowerCase()));

  return (
    <div className="relative shrink-0 hairline-t">
      <AnimatePresence>
      {matches.length ? (
        <motion.div key="mentions" role="listbox" variants={popoverVariants} initial="hidden" animate="visible" exit="exit" transition={popoverTransition} style={{ transformOrigin: 'bottom left' }} className="absolute bottom-full left-(--content-padding) z-20 mb-2 flex min-w-[220px] flex-col gap-0.5 rounded-lg bg-surface-raised p-1 shadow-(--shadow-popover)">
          {matches.map((a, i) => (
            <button key={a.id} type="button" role="option" aria-selected={i === index} onMouseEnter={() => setIndex(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(a)} className={cn('flex items-center gap-2 rounded-md px-2 py-1 text-left text-[12.5px]', i === index ? 'bg-surface-hover text-primary' : 'text-secondary')}>
              <AgentAvatar agent={a} size={18} />
              <span className="font-medium">{a.name}</span>
              <span className="ml-auto pl-3 font-mono text-[11px] text-muted">{handleOf(a)}</span>
            </button>
          ))}
        </motion.div>
      ) : null}
      </AnimatePresence>
      <div className="flex items-end gap-2 px-(--content-padding) py-[10px]">
        <Textarea
          ref={ref}
          bare
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setCaret(e.target.selectionStart ?? e.target.value.length);
            setIndex(0);
          }}
          onSelect={(e) => setCaret((e.target as HTMLTextAreaElement).selectionStart ?? 0)}
          onKeyDown={(e) => {
            if (matches.length && token) {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setIndex((i) => (i + 1) % matches.length);
                return;
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setIndex((i) => (i - 1 + matches.length) % matches.length);
                return;
              }
              if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                pick(matches[index] ?? matches[0]);
                return;
              }
            }
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          minRows={1}
          maxRows={8}
          placeholder={agents.length ? t('Write to the room — @ to pick an agent') : t('Add an agent to the room first.')}
          disabled={!agents.length}
          className="min-w-0 flex-1 font-mono text-[13px] leading-[1.6] text-primary placeholder:text-muted"
        />
        <Tooltip content={mentioned.length ? t('Send to {names}', { names: mentioned.map((a) => a.name).join(', ') }) : t('Send to everyone')} side="top">
          <button type="button" aria-label={t('Send')} disabled={!value.trim() || !agents.length} onClick={send} className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-inverse press disabled:opacity-40">
            <Send className="size-[13px]" />
          </button>
        </Tooltip>
      </div>
      <div className="flex items-center gap-2 px-(--content-padding) pb-2 text-[11px] text-muted">
        {mentioned.length ? (
          <span className="inline-flex items-center gap-1">
            → {mentioned.map((a) => (
              <AgentAvatar key={a.id} agent={a} size={14} />
            ))}
            {mentioned.map((a) => a.name).join(', ')}
          </span>
        ) : (
          <span>{t('To everyone · @ to pick one')}</span>
        )}
        <span className="flex-1" />
        <span>{t('Enter to send · Shift+Enter for a new line')}</span>
      </div>
    </div>
  );
}

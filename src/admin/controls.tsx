/**
 * Small controls shared by the leads table and the lead details panel.
 */
import React from 'react';
import { ChevronDown } from 'lucide-react';
import { LEAD_STAGES, type AdminUser } from '../data/leads';
import { SOURCE_STYLE, STAGE_STYLE, sourceLabel } from './format';

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

/** The stage as a coloured pill that is also a dropdown. */
export const StageSelect: React.FC<{ value: string; onChange: (stage: string) => void; label: string }> = ({ value, onChange, label }) => (
  <div className="relative inline-flex" onClick={stop}>
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={stop}
      className={`appearance-none cursor-pointer rounded-full border pl-3.5 pr-8 py-1.5 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[#C5A880] ${STAGE_STYLE[value] ?? STAGE_STYLE.lost}`}
    >
      {LEAD_STAGES.map((s) => (
        <option key={s.id} value={s.id} className="bg-white text-[#1D1714]">
          {s.label}
        </option>
      ))}
    </select>
    <ChevronDown aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 opacity-70" />
  </div>
);

/** Who on the team is handling the lead. */
export const AssigneeSelect: React.FC<{
  value: string | null;
  users: AdminUser[];
  onChange: (userId: string | null) => void;
  label: string;
}> = ({ value, users, onChange, label }) => (
  <div className="relative inline-flex max-w-full" onClick={stop}>
    <select
      aria-label={label}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      onKeyDown={stop}
      className={`appearance-none cursor-pointer max-w-full truncate rounded-lg border border-transparent hover:border-[#E7DFD6] bg-transparent pl-2 pr-7 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#C5A880] ${value ? 'text-[#1D1714]' : 'text-[#C2853D]'}`}
    >
      <option value="" className="text-[#1D1714]">
        Unassigned
      </option>
      {users.map((u) => (
        <option key={u.id} value={u.id} className="text-[#1D1714]">
          {u.name}
        </option>
      ))}
    </select>
    <ChevronDown aria-hidden className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9E7D53]" />
  </div>
);

export const SourcePill: React.FC<{ source: string }> = ({ source }) => {
  const style = SOURCE_STYLE[source] ?? SOURCE_STYLE.website;
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${style.pill}`}>
      <span aria-hidden className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
      {sourceLabel(source)}
    </span>
  );
};

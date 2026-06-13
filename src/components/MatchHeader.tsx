import type { Club, MatchInfo } from '../types';

function monogram(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function Crest({ name, logoUrl, color }: { name: string; logoUrl?: string | null; color: string }) {
  return (
    <div className="sw1-crest">
      <div className="sw1-crest__badge">
        {logoUrl ? <img src={logoUrl} alt={name} /> : <span style={{ background: color }}>{monogram(name)}</span>}
      </div>
      <div className="sw1-crest__name">{name}</div>
    </div>
  );
}

interface Props {
  club: Club;
  match: MatchInfo;
  vsStyle?: 'chrome' | 'split';
}

export default function MatchHeader({ club, match, vsStyle = 'chrome' }: Props) {
  return (
    <header className="sw1-header">
      {/* faint crests bleeding off each side */}
      {club.logoUrl && <img className="sw1-header__ghost sw1-header__ghost--l" src={club.logoUrl} alt="" />}
      {match.opponentLogoUrl && (
        <img className="sw1-header__ghost sw1-header__ghost--r" src={match.opponentLogoUrl} alt="" />
      )}

      <div className="sw1-header__crests">
        <Crest name={club.name} logoUrl={club.logoUrl} color={club.secondaryColor} />
        <div className={`sw1-header__v sw1-header__v--${vsStyle}`} aria-hidden>
          <span className="sw1-header__bolt" />
          <span className="sw1-header__vs">VS</span>
        </div>
        <Crest name={match.opponent} logoUrl={match.opponentLogoUrl} color="#64748b" />
      </div>

      <div className="sw1-fixture">
        {match.round?.trim() && <div className="sw1-fixture__round">{match.round}</div>}
        <div className="sw1-fixture__grade">{match.grade}</div>
        <div className="sw1-fixture__when">
          {match.date} &nbsp;•&nbsp; {match.time} &nbsp;•&nbsp; {match.venue}
        </div>
        {match.competition && <div className="sw1-fixture__comp">{match.competition}</div>}
      </div>
    </header>
  );
}

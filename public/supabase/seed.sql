-- ============================================================================
--  Demo seed — the "Riverton Hawks vs Hillcrest Cats" sample, in the database.
--  Run AFTER schema.sql. Re-running clears and reinserts the demo rows only.
-- ============================================================================
begin;

-- fixed ids so foreign keys are easy to wire
-- club 1111… = Riverton Hawks (home), 2222… = Hillcrest Cats (opponent)
delete from clubs where id in
  ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222');
delete from venues where id = '33333333-3333-3333-3333-333333333333';

insert into clubs (id,name,short_name,primary_color,secondary_color,ink_color) values
  ('11111111-1111-1111-1111-111111111111','Riverton Hawks','Hawks','#0c2340','#f5b301','#0c2340'),
  ('22222222-2222-2222-2222-222222222222','Hillcrest Cats','Cats','#1f3a5f','#ffffff','#1f3a5f');

insert into venues (id,name) values
  ('33333333-3333-3333-3333-333333333333','Riverton Reserve');

insert into teams (id,club_id,name,competition) values
  ('44444444-4444-4444-4444-444444444444',
   '11111111-1111-1111-1111-111111111111','Seniors','Eastern Football Netball League');

insert into fixtures (id,team_id,round,match_date,match_time,venue_id,opponent_club_id) values
  ('55555555-5555-5555-5555-555555555555',
   '44444444-4444-4444-4444-444444444444','Round 7','2026-07-20','2:10 PM',
   '33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222');

insert into lineups (id,fixture_id,published) values
  ('66666666-6666-6666-6666-666666666666','55555555-5555-5555-5555-555555555555',true);

-- players (club-scoped). number is the join key used below.
insert into players (club_id,number,first_name,last_name) values
  ('11111111-1111-1111-1111-111111111111','14','Tom','Wallis'),
  ('11111111-1111-1111-1111-111111111111','2','Jack','Reardon'),
  ('11111111-1111-1111-1111-111111111111','5','Dylan','Cooke'),
  ('11111111-1111-1111-1111-111111111111','7','Sam','Okafor'),
  ('11111111-1111-1111-1111-111111111111','23','Marcus','Field'),
  ('11111111-1111-1111-1111-111111111111','11','Lochie','Grant'),
  ('11111111-1111-1111-1111-111111111111','19','Ben','Castellano'),
  ('11111111-1111-1111-1111-111111111111','9','Will','Patterson'),
  ('11111111-1111-1111-1111-111111111111','4','Ari','Nguyen'),
  ('11111111-1111-1111-1111-111111111111','21','Cooper','Slade'),
  ('11111111-1111-1111-1111-111111111111','17','Jye','Hammond'),
  ('11111111-1111-1111-1111-111111111111','3','Eli','Brooks'),
  ('11111111-1111-1111-1111-111111111111','26','Nate','Cummings'),
  ('11111111-1111-1111-1111-111111111111','32','Hugo','Marsh'),
  ('11111111-1111-1111-1111-111111111111','8','Riley','Faulkner'),
  ('11111111-1111-1111-1111-111111111111','28','Max','Donovan'),
  ('11111111-1111-1111-1111-111111111111','16','Charlie','Vos'),
  ('11111111-1111-1111-1111-111111111111','12','Theo','Park'),
  ('11111111-1111-1111-1111-111111111111','20','Beau','Salter'),
  ('11111111-1111-1111-1111-111111111111','6','Jordan','Ash'),
  ('11111111-1111-1111-1111-111111111111','29','Kai','Whitlock'),
  ('11111111-1111-1111-1111-111111111111','31','Lucas','Reid'),
  ('11111111-1111-1111-1111-111111111111','41','Sol','Ferraro')
on conflict do nothing;

-- field placements: map guernsey number -> position
insert into lineup_positions (lineup_id, player_id, position_key)
select '66666666-6666-6666-6666-666666666666', p.id, v.pos::position_key
from (values
  ('14','FB'), ('2','BPL'), ('5','BPR'),
  ('7','CHB'),('23','HBL'),('11','HBR'),
  ('19','WL'), ('9','C'),  ('4','WR'),
  ('21','HFL'),('17','CHF'),('3','HFR'),
  ('26','FPL'),('32','FF'), ('8','FPR')
) as v(num,pos)
join players p on p.club_id='11111111-1111-1111-1111-111111111111' and p.number=v.num;

-- bench placements
insert into lineup_positions (lineup_id, player_id, bench_area, sort_order)
select '66666666-6666-6666-6666-666666666666', p.id, v.area::bench_area, v.ord
from (values
  ('28','followers',0),('16','followers',1),('12','followers',2),
  ('20','interchange',0),('6','interchange',1),
  ('29','emergencies',0),('31','emergencies',1),
  ('41','unavailable',0)
) as v(num,area,ord)
join players p on p.club_id='11111111-1111-1111-1111-111111111111' and p.number=v.num;

-- sponsors (rotating banner)
delete from sponsors where club_id='11111111-1111-1111-1111-111111111111';
insert into sponsors (club_id,name,tier,sort_order) values
  ('11111111-1111-1111-1111-111111111111','Riverton Motors','Major Sponsor',0),
  ('11111111-1111-1111-1111-111111111111','Hillside Bakery','Club Partner',1),
  ('11111111-1111-1111-1111-111111111111','Coastal Plumbing','Sponsor',2);

commit;

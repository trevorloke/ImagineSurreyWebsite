// Fixed copy for the promise tracker page. Promise statuses and updates live
// in the database and are managed in /admin/tracker.

export const trackerIntro = {
  title: "Safe Surrey promise tracker",
  lede: "Every promise Doug McCallum and the Safe Surrey Coalition made in the 2026 campaign, logged against delivery so Surrey residents can see what was kept.",
  summary:
    "Safe Surrey made 26 trackable promises and costed none of them; three carry dates, and the rest depend on money, the Province, or TransLink that the party has not secured. With eight of nine votes, there is no one else to blame when a line slips.",
};

export const trackerHighlights = [
  {
    title: "The biggest tickets",
    body: "A full-service hospital on City land, SkyTrain to Newton, three new pools or aquatic centres plus a Newton community centre, a police helicopter and drone fleet, and four years of 0% property tax to pay for all of it. McCallum declined to give costs at the hospital launch and said the savings would come from inside City Hall.",
  },
  {
    title: "The first deadlines",
    body: 'A forensic auditor engaged as a "first act" after the early-November inaugural meeting; Elections BC filings by January 15, 2027; the helicopter and drones in the air by early February 2027; and the 2027 financial plan, due by May 15, 2027, where 0% meets the police budget.',
  },
  {
    title: "What to watch at the first meetings",
    body: "Whether the auditor is independent and the scope covers the arena land exchange and 7580 152 Street; whether the Metro Vancouver withdrawal starts with a letter to the Province or with the study they swore off; how many items go in camera after a promise of none; and whether the first budget moves the parcel tax, utility rates, or recreation fees while the property tax line stays at zero.",
  },
];

export const scoringNote =
  'A promise is scored against what the party said, not against what is reasonable; where a pledge collides with provincial law, the collision is noted so "the Province wouldn\'t let us" can be judged on its own terms.';

export type KeyDate = { label: string; start: string; end?: string; hard?: boolean; note?: string };

// The Safe Surrey term, November 2026 to October 2030.
export const keyDates: KeyDate[] = [
  { label: "Inaugural council meeting", start: "2026-11-02", note: "Estimated; the 2022 inaugural was November 7" },
  { label: "Elections BC filings due", start: "2027-01-15", note: "90 days after voting day" },
  { label: "Helicopter and drones: 90 days", start: "2027-01-31", end: "2027-02-07", hard: true, note: "90 days from the inaugural meeting" },
  { label: "Budget 2027: the first 0% test", start: "2027-03-01", end: "2027-05-15" },
  { label: "Budget 2028", start: "2028-03-01", end: "2028-05-15" },
  { label: "Budget 2029", start: "2029-03-01", end: "2029-05-15" },
  { label: "Budget 2030", start: "2030-03-01", end: "2030-05-15" },
  { label: "Next election", start: "2030-10-19" },
];

export const termStart = "2026-11-01";
export const termEnd = "2030-10-31";

export const sourcesNote =
  "The party's platform and news pages returned server errors on October 18, 2026; its homepage loaded and is cited for the six headline pledges. Everything else is coverage of the party's own releases, events, and candidate submissions.";

const NL = "https://surreynowleader.com/2026/10/04/meet-your-surrey-candidates-";

export const sourceGroups: { label: string; links: { label: string; url: string }[] }[] = [
  {
    label: "Safe Surrey Coalition",
    links: [
      { label: "Homepage", url: "https://safesurreycoalition.ca/" },
      { label: "Platform (unreachable on October 18)", url: "https://safesurreycoalition.ca/platform" },
      { label: "News (unreachable on October 18)", url: "https://safesurreycoalition.ca/news" },
    ],
  },
  {
    label: "Campaign launch, April 13, 2026",
    links: [
      { label: "Voice: launch release", url: "https://voiceonline.com/safe-surrey-coalition-doug-mccallum-announces-re-election-bid-vows-to-deliver-surreys-defining-legacy/" },
      { label: "Daily Hive: launch", url: "https://dailyhive.com/vancouver/doug-mccallum-surrey-2026" },
      { label: "Surrey Now-Leader: McCallum running again", url: "https://surreynowleader.com/2026/04/13/former-surrey-mayor-doug-mccallum-running-again/" },
    ],
  },
  {
    label: "Summer campaign",
    links: [
      { label: "Peace Arch News: promises at campaign event, July 23", url: "https://cloverdalereporter.com/2026/07/23/mccallum-makes-impressive-promises-at-surrey-election-campaign-event/" },
      { label: "Surrey Citizen: Metro Vancouver, July 23", url: "https://surreycitizen.com/mccallum-would-pull-surrey-out-of-metro-vancouver-if-elected/" },
      { label: "Daily Hive: Metro Vancouver, July 22", url: "https://dailyhive.com/vancouver/surrey-doug-mccallum-leave-metro-vancouver" },
      {
        label: "Surrey Now-Leader: Elections BC complaint, July 29",
        url: "https://surreynowleader.com/2026/07/29/mccallum-files-formal-complaint-with-elections-bc-rcmp-for-claims-of-election-interference-in-surrey/",
      },
      { label: "Surrey Citizen: Cloke joins, August 4", url: "https://surreycitizen.com/surrey-candidate-quits-party-joins-mccallums-coalition/" },
      { label: "Surrey Citizen: hospital pledge, September 21", url: "https://surreycitizen.com/mccallum-pledges-to-get-new-surrey-hospital-built-but-has-few-details/" },
      { label: "Cloverdale Reporter: wards, October 2", url: "https://cloverdalereporter.com/2026/10/02/mccallum-says-ssc-led-surrey-council-would-bring-wards-back/" },
    ],
  },
  {
    label: "Candidate profiles, Surrey Now-Leader, October 4, 2026",
    links: [
      { label: "Index", url: "https://surreynowleader.com/2026/10/04/surrey-votes-meet-your-candidates-for-mayor-council-school-board/" },
      { label: "McCallum", url: `${NL}doug-mccallum-mayor/` },
      { label: "Elford", url: `${NL}doug-elford-city-council/` },
      { label: "Meera Gill", url: `${NL}meera-gill-city-council/` },
      { label: "Suhana Gill", url: `${NL}suhana-gill-city-council/` },
      { label: "Nagra", url: `${NL}mandeep-nagra-city-council/` },
      { label: "Patton", url: `${NL}allison-patton-city-council/` },
      { label: "Guerra", url: `${NL}laurie-guerra-city-council/` },
      { label: "Cloke", url: "https://surreynowleader.com/2026/10/04/cheney-cloke-safe-surrey-coalition/" },
    ],
  },
  {
    label: "Platform summaries",
    links: [
      { label: "The Runner: platform breakdown, October 12", url: "https://runnermag.ca/2026/10/surrey-votes-a-breakdown-of-the-2026-municipal-party-platforms/" },
      { label: "voche.me: Safe Surrey tracker", url: "https://voche.me/bc/surrey-2026/parties/safe-surrey-coalition" },
      {
        label: "Daily Hive: supermajority and platform summary, October 18",
        url: "https://dailyhive.com/vancouver/doug-mccallum-safe-surrey-coalition-2026-civic-election-supermajority-victory",
      },
    ],
  },
  {
    label: "Election night",
    links: [
      { label: "Peace Arch News, October 17", url: "https://surreynowleader.com/2026/10/17/surrey-mayral-race-doug-mccallum-topples-brenda-locke-to-win-5th-term/" },
      { label: "Voice, October 17", url: "https://voiceonline.com/mccallum-will-be-mayor-of-surrey-for-third-time-says-nagra-will-be-deputy-mayor-updates/" },
      { label: "Surrey Now-Leader results, October 18", url: "https://surreynowleader.com/2026/10/18/surrey-election-results-how-the-votes-broke-down/" },
    ],
  },
];

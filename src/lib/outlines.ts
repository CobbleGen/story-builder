// Common story structures a writer can lay over an arc: each a list of
// steps, in order, saying what should happen there, and where in the arc
// it falls (0 at its start, 1 at its end), used to spread the steps over
// the arc's beats to begin with.

export interface OutlineStep {
  id: string
  name: string
  /** What should happen at this step. */
  what: string
  /** Where it falls in the arc, from 0 (the start) to 1 (the end). */
  at: number
}

export type OutlineGroup = 'Plot structures' | 'Journeys' | 'Character arcs' | 'Genres'

export interface OutlineKind {
  id: string
  name: string
  group: OutlineGroup
  /** What it is, and whose. */
  summary: string
  steps: OutlineStep[]
}

export const OUTLINE_GROUPS: OutlineGroup[] = ['Plot structures', 'Journeys', 'Character arcs', 'Genres']

const step = (id: string, name: string, at: number, what: string): OutlineStep => ({ id, name, what, at })

export const OUTLINES: OutlineKind[] = [
  {
    id: 'three-act',
    name: 'Three-act structure',
    group: 'Plot structures',
    summary: 'Set-up, confrontation and resolution: the shape most stories share, turning at two plot points and a midpoint.',
    steps: [
      step('setup', 'Set-up', 0, 'Show the ordinary world: who the character is, what they want, and what’s wrong.'),
      step('inciting', 'Inciting incident', 0.12, 'Something upsets the way things are and starts the story moving.'),
      step('plot-point-1', 'First plot point', 0.25, 'The character commits to the problem, and there’s no going back. Act two begins.'),
      step('rising', 'Rising action', 0.37, 'They go after what they want; obstacles and complications pile up.'),
      step('midpoint', 'Midpoint', 0.5, 'A big turn or revelation raises the stakes. They stop reacting and start acting.'),
      step('worse', 'Things get worse', 0.62, 'The opposition hits back harder; plans fail, and going on costs more.'),
      step('plot-point-2', 'Second plot point', 0.75, 'The low point: all seems lost, until something (a clue, a choice) sets up the final act.'),
      step('climax', 'Climax', 0.9, 'The final confrontation, where the central conflict is decided.'),
      step('resolution', 'Resolution', 1, 'The new normal: what the struggle has changed.'),
    ],
  },
  {
    id: 'save-the-cat',
    name: 'Save the Cat! beat sheet',
    group: 'Plot structures',
    summary: 'Blake Snyder’s fifteen beats, each with its place in the story.',
    steps: [
      step('opening-image', 'Opening image', 0, 'A snapshot of the hero and their world before anything changes.'),
      step('theme-stated', 'Theme stated', 0.05, 'Someone says, often in passing, what the story is really about; the hero doesn’t get it yet.'),
      step('set-up', 'Set-up', 0.08, 'The hero’s life, flaws and what’s missing, and the people around them.'),
      step('catalyst', 'Catalyst', 0.1, 'News or an event knocks the hero’s world off course.'),
      step('debate', 'Debate', 0.15, 'The hero doubts: should they go? Can they?'),
      step('break-into-two', 'Break into two', 0.2, 'The hero chooses to act, and steps into a new world or situation.'),
      step('b-story', 'B story', 0.22, 'A new relationship (love, friendship, a mentor) that will carry the theme.'),
      step('fun-and-games', 'Fun and games', 0.35, 'The promise of the premise: the hero explores the new world, for better or worse.'),
      step('midpoint', 'Midpoint', 0.5, 'A false victory or a false defeat raises the stakes; the clock starts ticking.'),
      step('bad-guys', 'Bad guys close in', 0.62, 'Enemies regroup outside, doubt and jealousy grow inside; things fall apart.'),
      step('all-is-lost', 'All is lost', 0.75, 'The lowest point: a loss, often with a whiff of death about it.'),
      step('dark-night', 'Dark night of the soul', 0.78, 'The hero wallows, then finds what they needed to learn.'),
      step('break-into-three', 'Break into three', 0.8, 'Inspired by the B story and the theme, the hero sees the way to win.'),
      step('finale', 'Finale', 0.9, 'The hero acts on the lesson, defeats the bad guys and changes their world.'),
      step('final-image', 'Final image', 1, 'The opposite of the opening image: proof that change has happened.'),
    ],
  },
  {
    id: 'seven-point',
    name: 'Seven-point structure',
    group: 'Plot structures',
    summary: 'Dan Wells’s structure, best planned from the end back: where the character ends is the opposite of where they begin.',
    steps: [
      step('hook', 'Hook', 0, 'The character’s starting state: the opposite of where they’ll end.'),
      step('plot-turn-1', 'Plot turn 1', 0.17, 'Something new (a person, an idea, an event) sets the story moving.'),
      step('pinch-1', 'Pinch point 1', 0.33, 'Pressure: the antagonist or problem shows its strength and forces the character to act.'),
      step('midpoint', 'Midpoint', 0.5, 'The character stops reacting and starts acting, committing to the goal.'),
      step('pinch-2', 'Pinch point 2', 0.67, 'More pressure: plans fail, help is lost, and things look hopeless.'),
      step('plot-turn-2', 'Plot turn 2', 0.83, 'The character finds the last thing they need to win (often, that it was in them all along).'),
      step('resolution', 'Resolution', 1, 'The climax and its end: the change that began at the hook is complete.'),
    ],
  },
  {
    id: 'freytag',
    name: 'Freytag’s pyramid',
    group: 'Plot structures',
    summary: 'Gustav Freytag’s five parts, rising to a climax and falling to the end: the classic shape of tragedy.',
    steps: [
      step('exposition', 'Exposition', 0, 'The setting, the characters and the situation before the conflict.'),
      step('rising', 'Rising action', 0.25, 'Complications build the conflict and the tension.'),
      step('climax', 'Climax', 0.5, 'The turning point, where the hero’s fortunes change, for better or (in tragedy) worse.'),
      step('falling', 'Falling action', 0.75, 'The consequences of the climax play out; the end comes into sight.'),
      step('denouement', 'Denouement', 1, 'The conflict is resolved, or catastrophe falls, and loose ends are tied up.'),
    ],
  },
  {
    id: 'fichtean',
    name: 'Fichtean curve',
    group: 'Plot structures',
    summary: 'Straight into the trouble: a run of rising crises to a climax, with little set-up. Good for thrillers and fast-moving arcs.',
    steps: [
      step('first-crisis', 'Inciting crisis', 0, 'Open in trouble; weave in the background later.'),
      step('crisis-2', 'Second crisis', 0.25, 'They deal with the first, but a bigger problem rises.'),
      step('crisis-3', 'Third crisis', 0.5, 'The tension climbs; the stakes become personal.'),
      step('crisis-4', 'Fourth crisis', 0.7, 'The worst yet, pushing everything to breaking point.'),
      step('climax', 'Climax', 0.85, 'The final, highest crisis, where everything is decided.'),
      step('falling', 'Falling action', 1, 'A short wind-down: what’s left once the dust settles.'),
    ],
  },
  {
    id: 'kishotenketsu',
    name: 'Kishōtenketsu',
    group: 'Plot structures',
    summary: 'Four parts from Chinese and Japanese storytelling, built on a twist rather than on conflict.',
    steps: [
      step('ki', 'Ki: introduction', 0, 'Introduce the characters and their world.'),
      step('sho', 'Shō: development', 0.33, 'Follow them further, with no great change yet.'),
      step('ten', 'Ten: twist', 0.67, 'Something unexpected, seemingly unrelated, that recasts what came before.'),
      step('ketsu', 'Ketsu: reconciliation', 1, 'Bring it together: how the twist and the rest fit, and what it means.'),
    ],
  },
  {
    id: 'story-spine',
    name: 'Story spine',
    group: 'Plot structures',
    summary: 'Kenn Adams’s improv structure: a quick way to find the bones of a story.',
    steps: [
      step('once', 'Once upon a time…', 0, 'Who and where: the world and its people.'),
      step('every-day', 'Every day…', 0.17, 'The routine: how things usually are.'),
      step('one-day', 'But one day…', 0.33, 'Something breaks the routine.'),
      step('because-1', 'Because of that…', 0.5, 'A consequence of the change.'),
      step('because-2', 'Because of that…', 0.67, 'A further consequence, raising the stakes.'),
      step('until', 'Until finally…', 0.83, 'The climax that everything has been building to.'),
      step('ever-since', 'And ever since then…', 1, 'The new routine: how things are now.'),
    ],
  },
  {
    id: 'heros-journey',
    name: 'The Hero’s Journey',
    group: 'Journeys',
    summary: 'Christopher Vogler’s twelve stages, after Joseph Campbell: a hero leaves the ordinary world, is tested, and comes home changed.',
    steps: [
      step('ordinary-world', 'Ordinary world', 0, 'The hero at home before the adventure: what they lack, what they long for.'),
      step('call', 'Call to adventure', 0.1, 'A problem, challenge or opportunity arrives that can’t be ignored for long.'),
      step('refusal', 'Refusal of the call', 0.17, 'Fear, duty or doubt makes the hero hesitate, or say no.'),
      step('mentor', 'Meeting the mentor', 0.22, 'Someone (or something) gives advice, a gift, or the courage to go.'),
      step('threshold', 'Crossing the threshold', 0.27, 'The hero commits and enters the special world of the story; there’s no turning back.'),
      step('tests', 'Tests, allies and enemies', 0.38, 'The hero learns the rules of the new world, makes friends and enemies, and is tested.'),
      step('approach', 'Approach to the inmost cave', 0.48, 'Preparing for the great ordeal, as doubts and dangers close in.'),
      step('ordeal', 'The ordeal', 0.55, 'The hero faces their greatest fear or a deadly crisis, and “dies” to be reborn.'),
      step('reward', 'Reward', 0.65, 'Having survived, the hero seizes the prize: an object, knowledge, a reconciliation.'),
      step('road-back', 'The road back', 0.75, 'The hero turns for home, often chased by the forces they stirred up.'),
      step('resurrection', 'Resurrection', 0.88, 'A last, greatest test, where everything is at stake; it changes the hero for good.'),
      step('elixir', 'Return with the elixir', 1, 'The hero comes home with something that changes their world.'),
    ],
  },
  {
    id: 'story-circle',
    name: 'Story circle',
    group: 'Journeys',
    summary: 'Dan Harmon’s eight steps: a character in their comfort zone wants something, goes after it, gets it, pays for it, and comes back changed.',
    steps: [
      step('you', 'You', 0, 'A character in their zone of comfort…'),
      step('need', 'Need', 0.14, '…wants something.'),
      step('go', 'Go', 0.28, 'They enter an unfamiliar situation…'),
      step('search', 'Search', 0.42, '…adapt to it, and search for what they want.'),
      step('find', 'Find', 0.56, 'They get it…'),
      step('take', 'Take', 0.7, '…and pay a heavy price for it.'),
      step('return', 'Return', 0.85, 'They go back to the familiar situation…'),
      step('change', 'Change', 1, '…having changed.'),
    ],
  },
  {
    id: 'heroines-journey',
    name: 'The Heroine’s Journey',
    group: 'Journeys',
    summary: 'After Maureen Murdock: a journey inward, of separation, descent and making whole again, rather than of conquest.',
    steps: [
      step('separation', 'Separation from the feminine', 0, 'She turns away from what she was taught to be, or what she’s been told she is.'),
      step('allies', 'Identifying with the masculine', 0.12, 'She takes on the world’s idea of strength and gathers allies.'),
      step('trials', 'The road of trials', 0.25, 'She faces the ogres and dragons of a world that doubts her.'),
      step('boon', 'The illusory boon of success', 0.38, 'She wins, yet it isn’t what she needed.'),
      step('wasteland', 'The spiritual wasteland', 0.5, 'Emptiness, betrayal or loss: the success rings hollow.'),
      step('descent', 'Initiation and descent', 0.62, 'She goes down into the dark, to face what she lost or rejected.'),
      step('reconnection', 'Reconnection', 0.75, 'She finds again what she turned away from, and heals the split in herself.'),
      step('integration', 'Integration', 0.88, 'She brings the parts of herself together.'),
      step('wholeness', 'Wholeness', 1, 'She returns whole, able to live, and lead, as herself.'),
    ],
  },
  {
    id: 'positive-arc',
    name: 'Positive change arc',
    group: 'Character arcs',
    summary: 'After K. M. Weiland: a character who believes a lie comes to the truth, and changes for the better.',
    steps: [
      step('lie', 'The lie they believe', 0, 'Their normal world, and the false belief about themselves or the world that holds them back.'),
      step('want-need', 'Want versus need', 0.06, 'They chase what they want; what they really need is the truth.'),
      step('inciting', 'Inciting event', 0.12, 'A call to change, which they don’t yet understand or answer.'),
      step('plot-point-1', 'First plot point', 0.25, 'They leave their comfort zone; the lie starts to fail them.'),
      step('pinch-1', 'First pinch point', 0.37, 'The cost of the lie: the opposition shows what’s at stake.'),
      step('truth', 'Moment of truth', 0.5, 'They glimpse the truth and begin to act on it, though still holding on to the lie.'),
      step('pinch-2', 'Second pinch point', 0.62, 'The truth is tested: going on will cost more than they thought.'),
      step('plot-point-3', 'Third plot point', 0.75, 'The low point: they must give up the lie completely, or lose everything.'),
      step('climax', 'Climax', 0.9, 'They act on the truth, wholly, and it lets them win.'),
      step('resolution', 'Resolution', 1, 'The new normal: who they are now.'),
    ],
  },
  {
    id: 'negative-arc',
    name: 'Negative change arc',
    group: 'Character arcs',
    summary: 'A fall: disillusionment, corruption or ruin. A character who could come to the truth chooses the lie, or loses the truth they had.',
    steps: [
      step('start', 'Who they are at the start', 0, 'The lie they believe, or the truth they hold but will give up.'),
      step('inciting', 'Inciting event', 0.12, 'An offer, a temptation or a call that touches the flaw.'),
      step('plot-point-1', 'First plot point', 0.25, 'They commit, for the wrong reasons.'),
      step('pinch-1', 'First pinch point', 0.37, 'The cost of the lie shows, and they look away.'),
      step('truth', 'Moment of truth', 0.5, 'They see the truth clearly, and reject it (or are crushed by it).'),
      step('pinch-2', 'Second pinch point', 0.62, 'They double down; the people around them pay.'),
      step('plot-point-3', 'Third plot point', 0.75, 'A last chance to turn back, refused.'),
      step('climax', 'Climax', 0.9, 'The lie wins: they fail, fall, or become what they fought.'),
      step('resolution', 'Resolution', 1, 'The wreckage: what their choice has cost them and others.'),
    ],
  },
  {
    id: 'flat-arc',
    name: 'Flat arc',
    group: 'Character arcs',
    summary: 'The character already holds the truth and stands by it; the world around them is what changes. Common for mentors, and heroes of series.',
    steps: [
      step('truth', 'The truth they hold', 0, 'The character’s truth, in a world gripped by a lie.'),
      step('inciting', 'Inciting event', 0.12, 'The world’s lie confronts them.'),
      step('plot-point-1', 'First plot point', 0.25, 'They choose to stand for the truth, whatever it costs.'),
      step('pinch-1', 'First pinch point', 0.37, 'The world pushes back, and doubt creeps in.'),
      step('midpoint', 'Midpoint', 0.5, 'They show the truth to someone, and the world starts to shift.'),
      step('pinch-2', 'Second pinch point', 0.62, 'The lie strikes back hard; the truth is tested.'),
      step('plot-point-3', 'Third plot point', 0.75, 'They nearly give in, and choose the truth again.'),
      step('climax', 'Climax', 0.9, 'Their truth defeats the lie.'),
      step('resolution', 'Resolution', 1, 'The world, or the people around them, changed by the truth.'),
    ],
  },
  {
    id: 'mystery',
    name: 'Mystery (whodunit)',
    group: 'Genres',
    summary: 'A crime, a sleuth, clues and red herrings, a twist and the reveal. Play fair: the reader sees every clue the detective does.',
    steps: [
      step('crime', 'The crime', 0, 'A crime (often a murder) or a puzzle, shown or discovered: who did it, and why?'),
      step('detective', 'The detective takes the case', 0.08, 'The sleuth, and why they get involved; what makes it personal.'),
      step('suspects', 'Suspects and first clues', 0.2, 'Meet the suspects, each with a motive, the means or the chance; plant the first clues fairly.'),
      step('red-herring', 'A red herring', 0.33, 'A false lead points the wrong way, at the wrong person.'),
      step('complication', 'Complication', 0.43, 'A second crime, a missing witness or a new fact: the case gets darker.'),
      step('midpoint', 'Midpoint twist', 0.5, 'A discovery overturns the first theory of the crime.'),
      step('danger', 'The detective in danger', 0.65, 'Getting close makes the sleuth a target.'),
      step('all-lost', 'All seems lost', 0.75, 'The theory collapses, the wrong person is arrested, or the trail goes cold.'),
      step('key-clue', 'The key clue', 0.85, 'A detail that was there all along falls into place: the sleuth sees the truth.'),
      step('reveal', 'The reveal', 0.95, 'The confrontation: the culprit unmasked, and the clues explained.'),
      step('aftermath', 'Aftermath', 1, 'Justice, or its failure, and what solving it has cost.'),
    ],
  },
  {
    id: 'romance',
    name: 'Romance',
    group: 'Genres',
    summary: 'Love-story beats, after Gwen Hayes’s Romancing the Beat: two people meet, resist, fall, break apart, and choose each other.',
    steps: [
      step('two-lives', 'Two lives', 0, 'Each lead before they meet: what’s missing, and the wound that will keep them apart.'),
      step('meet', 'They meet', 0.08, 'Sparks fly, for good or ill.'),
      step('no-way', 'No way', 0.15, 'Reasons it can’t work: they push back against the attraction.'),
      step('forced-together', 'Forced together', 0.22, 'Something keeps them in each other’s lives.'),
      step('deepening', 'Deepening desire', 0.35, 'They see more of each other, and like what they see.'),
      step('midpoint', 'Midpoint of love', 0.5, 'A first kiss, a night together or a moment of honesty: this could be real.'),
      step('doubt', 'Doubt', 0.6, 'Old wounds and fears come back; one of them starts to pull away.'),
      step('break-up', 'The break-up', 0.75, 'The fear wins: they part, and it hurts.'),
      step('dark-night', 'Dark night', 0.82, 'Alone, each faces the wound, and what they really want.'),
      step('grand-gesture', 'Grand gesture', 0.92, 'One of them risks everything to show they’ve changed.'),
      step('together', 'Happily ever after', 1, 'They choose each other, whole-heartedly (for ever, or for now).'),
    ],
  },
  {
    id: 'heist',
    name: 'Heist',
    group: 'Genres',
    summary: 'The job, the crew, the plan, and the twist that was there all along.',
    steps: [
      step('job', 'The job', 0, 'The target, the prize, and why it has to be now.'),
      step('crew', 'Assembling the crew', 0.15, 'Gather the specialists, each with a skill and a reason to say yes (or no).'),
      step('plan', 'The plan', 0.3, 'How it should go; keep one card hidden from the reader.'),
      step('preparation', 'Preparation', 0.42, 'Scouting, rehearsals and the first snags; tension inside the crew.'),
      step('heist', 'The heist begins', 0.55, 'It runs like clockwork, at first.'),
      step('complication', 'Complication', 0.68, 'Something unplanned: a betrayal, an alarm, a guard who shouldn’t be there.'),
      step('falls-apart', 'It all falls apart', 0.78, 'The plan fails; the crew is trapped, split up or caught.'),
      step('twist', 'The twist', 0.9, 'The real plan, or the hidden card, revealed.'),
      step('getaway', 'Getaway and aftermath', 1, 'Who gets away, with what, and what it cost.'),
    ],
  },
]

const byId = new Map(OUTLINES.map((o) => [o.id, o]))

/** An outline by its id. */
export const outlineKind = (id: string | undefined): OutlineKind | undefined => (id ? byId.get(id) : undefined)

/**
 * Which beat each step goes on to begin with, spread over `beats` (in
 * order) by where the steps fall. With a beat for each, each step has its
 * own, in order, as near its place as it can be; with fewer beats, some
 * share. None with no beats.
 */
export function spreadSteps(kind: OutlineKind, beats: string[]): Record<string, string> {
  const m = beats.length
  if (!m) return {}
  const ideal = kind.steps.map((s) => Math.round(Math.max(0, Math.min(1, s.at)) * (m - 1)))
  const at = [...ideal]
  if (m >= kind.steps.length) {
    // One beat each, keeping the order: pushed later where they'd meet, then back where they'd run off the end.
    for (let i = 1; i < at.length; i++) at[i] = Math.max(at[i], at[i - 1] + 1)
    for (let i = at.length - 1; i >= 0; i--) at[i] = Math.min(at[i], (i === at.length - 1 ? m : at[i + 1]) - 1)
  } else {
    for (let i = 1; i < at.length; i++) at[i] = Math.max(at[i], at[i - 1])
  }
  return Object.fromEntries(kind.steps.map((s, i) => [s.id, beats[at[i]]]))
}

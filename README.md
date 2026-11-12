# Crosswise

An engineering research project for the Massachusetts Science and Engineering Fair (MSEF), focused on identifying and comparing **potential pedestrian crossing risks** along Great Road in Bedford, Massachusetts.

The project combines public traffic/crash records, verified crossing characteristics, and published transportation-safety research to develop transparent, comparable crossing risk estimates. A planned interactive map and simulator will illustrate potential risk factors and hypothetical infrastructure interventions.

**Important:** Scores are exploratory decision-support estimates, **not** certified safety ratings or predictions of exact crash probabilities. Suggested route and infrastructure changes do not guarantee safety or a reduction in real-world crashes.

## Data

MassDOT IMPACT crash exports and documentation are stored in `data/raw/`. Preserve raw exports and use separate, reproducible scripts for any cleaning, geographic matching, or analysis. A crash near an intersection is not automatically a pedestrian-crossing crash.

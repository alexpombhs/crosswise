# MassDOT IMPACT crash export

## Source
- Provider: Massachusetts Department of Transportation (MassDOT), [IMPACT Crash Data Visualizer](https://apps.crashdata.dot.mass.gov/cdv/)
- Export downloaded: November 11, 2026 at 20:22:26 (from original filename; timezone not independently verified)
- Original filename: `export_11_11_2026_20_22_26.csv`
- Query type indicated in exported file: **Spatial**
- Date range observed in records: January 7, 2016 through December 29, 2025
- Fields: 33 crash and linked-roadway columns, including coordinates
- Crash records: **755**, of which **740** have city/town BEDFORD and **15** LEXINGTON
- Raw export contains three trailing query-metadata rows after the crash table. Do not include those in crash counts.

## Interpretation and limitations

- **This is a spatially filtered dataset, not an exact Great Road-only dataset.** Retain the original export and verify a narrower study corridor against the selected geometry and road names in the data.
- A reported crash near a crosswalk is not evidence that the crash involved a pedestrian or occurred *at* the crossing.
- The presence of latitude and longitude does not guarantee that the mapped crash point is exact.
- Linked roadway attributes (such as AADT, lane count, and speed limit) may describe adjacent road segments rather than the crosswalk itself; inspect coverage and dates.
- These are **reported crashes**. Sites with zero records in this export are not necessarily free of crossing risk.
- Do not use this dataset alone to claim actual crash probabilities or certify pedestrian routes as safe.
- Avoid treating historical infrastructure or roadway characteristics as current without confirming any construction and traffic-control changes.

## Reproducibility

1. Preserve this export unchanged in `data/raw/massdot-impact/`.
2. Record the precise spatial selection polygon/buffer, additional filter choices, and query date in a research log; the export metadata does **not** encode the full geography of the visual selection.
3. Clean data into a separate derived file or script. Exclude footer metadata from the crash-table parsing.
4. Separate pedestrian-involved incidents, bicycle-involved incidents, and general road crashes for analysis. Keep injury and PDO categories available for sensitivity testing.
5. Match crashes to verified crosswalk coordinates with documented spatial rules; retain uncertain/unknown matches.

## License and use
This dataset was exported from a publicly accessible government data portal. Check MassDOT's applicable data-use terms before republishing records in a public-facing app.

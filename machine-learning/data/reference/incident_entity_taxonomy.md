### Incident Category Consolidation (for modeling)

Manual review of the generated synthetic corpus (326 ASRS-sourced records, 978 total
records across three language variants) revealed severe class imbalance across the six
incident categories, inherited from the real ASRS source data:

- Aircraft Equipment Problem: 169 records (51.8%)
- Deviation/Discrepancy - Procedural: 150 records (46.0%)
- Ground Excursion: 2 records (0.6%)
- Ground Incursion: 1 record (0.3%)
- Ground Event/Encounter: 4 records (1.2%)
- No Specific Anomaly Occurred: 0 records

This imbalance reflects the nature of the real ASRS maintenance narratives the corpus
was seeded from, rather than an artifact of the generation process. Categories with
fewer than 10 records cannot be meaningfully stratified across train/validation/test
splits, and would be unevaluable in isolation under a macro-F1 metric.

For modeling purposes only, the four lowest-frequency categories (Ground Excursion,
Ground Incursion, Ground Event/Encounter, and No Specific Anomaly Occurred) were
consolidated into a single grouping, `Other/Rare Ground Event`, stored in a separate
`incident_category_grouped` field. The original fine-grained `incident_category` label
is preserved unchanged on every record for transparency and traceability.

`incident_category_grouped` is the field used for stratified train/validation/test
splitting and for model evaluation. `incident_category` remains available for any
fine-grained analysis where the smaller categories are still of interest, with the
caveat that per-category statistics for the four consolidated categories are not
individually reliable given their small sample sizes.
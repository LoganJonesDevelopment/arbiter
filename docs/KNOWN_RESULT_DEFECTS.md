# Result defects awaiting review

These findings are reproduced with fictional fixtures. The fee formulas, matching rules, and financial-result logic remain unchanged pending review.

- A bundle declaring three markets but containing only two stored rows priced at 0.47 each is labeled complete and executable. Completeness currently counts only inactive fetched rows, so an entirely unfetched outcome can be omitted from a supposed guaranteed payout. Regression: `test_known_defect_unfetched_declared_outcome_must_not_be_executable`.
- "Inflation above 2.5 percent in 2026" and "Inflation above 3.5 percent in 2026" match and can produce an executable cross-exchange opportunity even though the payouts differ. The shared year satisfies the numeric-compatibility check. Regression: `test_known_defect_different_thresholds_in_shared_year_must_not_form_an_arb`.
- A Kalshi tailing market priced at 0.98 uses the configured Polymarket fee model, reporting 1.96% fee-adjusted edge instead of 1.86% under Arbiter's configured Kalshi model. This compares existing application models only; it does not assert current exchange fee policy. Regression: `test_known_defect_kalshi_tailing_must_use_configured_kalshi_fee`.

The tests mark these as expected failures, preserving a visible reproduction without silently accepting the behavior as correct. Correcting the payout/completeness assumptions and fee routing needs explicit review; do not replace expected outcomes with current erroneous values just to turn these into passing assertions.

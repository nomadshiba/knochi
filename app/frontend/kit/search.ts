/**
 * Scores how well `primary`/`secondary` match a search `term`.
 * Lower is a better match (closer to the start of the string, and `primary` matches rank above `secondary` ones).
 * Returns `null` when the term doesn't match either field at all (item should be filtered out).
 * An empty `term` matches everything with an equal score, i.e. no filtering/reordering.
 */
export function matchScore(primary: string, secondary: string, term: string): number | null {
    if (!term) return 0;

    const primaryIndex = primary.toLowerCase().indexOf(term);
    if (primaryIndex !== -1) return primaryIndex;

    const secondaryIndex = secondary.toLowerCase().indexOf(term);
    if (secondaryIndex !== -1) return 1000 + secondaryIndex;

    return null;
}

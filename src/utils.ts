export const detectIndentationUnit = (content: string): string | null => {
    // Skip empty lines or lines with only whitespace
    const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
    const indentCounts: Record<string, number> = {};
    const spaceIndents = new Set<number>();

    for (const line of lines) {
        const match = line.match(/^(\s+)/);
        if (!match) continue;

        const indent = match[0];

        // Handle tabs
        if (indent.includes('\t')) {
            indentCounts['\t'] = (indentCounts['\t'] || 0) + 1;
            continue;
        }

        // Handle spaces
        const spaceCount = indent.length;
        spaceIndents.add(spaceCount);
        indentCounts[indent] = (indentCounts[indent] || 0) + 1;
    }

    // If no indentation found
    if (Object.keys(indentCounts).length === 0) {
        return null;
    }

    // Find the most common indentation
    const sortedEntries = Object.entries(indentCounts)
        .sort((a, b) => b[1] - a[1]);

    const mostCommon = sortedEntries[0][0];

    // If tabs are used and they're frequent enough (>25% of indented lines)
    if (indentCounts['\t'] && indentCounts['\t'] / lines.length >= 0.25) {
        return '\t';
    }

    // For spaces, find the minimum common indentation unit
    if (!mostCommon.includes('\t')) {
        const spaceIndentLengths = Array.from(spaceIndents).sort((a, b) => a - b);
        if (spaceIndentLengths.length > 0) {
            // Find the GCD of all space indentations
            const gcd = (...numbers: number[]): number => {
                return numbers.reduce((a, b) => b === 0 ? a : gcd(b, a % b));
            };

            const commonUnit = gcd(...spaceIndentLengths);
            return ' '.repeat(commonUnit);
        }
    }

    return mostCommon;
};
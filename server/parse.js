function safeJsonParse(str) {
    // Μερικές φορές τα μοντέλα επιστρέφουν ```json ... ``` ή extra whitespace
    const trimmed = (str || "").trim();

    // Αν είναι fenced
    const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    const payload = fenced ? fenced[1].trim() : trimmed;

    try {
        return JSON.parse(payload);
    } catch {
        return null;
    }
}

function extractCppUmlFromJson(rawText) {
    const obj = safeJsonParse(rawText);
    if (!obj || typeof obj !== "object") return { cpp: null, uml: null, parsed: false };

    const cpp = typeof obj.cpp === "string" ? obj.cpp : null;
    const uml = typeof obj.uml === "string" ? obj.uml : null;

    return { cpp, uml, parsed: Boolean(cpp && uml) };
}

module.exports = { extractCppUmlFromJson };

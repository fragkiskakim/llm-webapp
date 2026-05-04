function stripFence(str, lang) {
    if (typeof str !== "string") return str;

    const re = new RegExp(
        "^```\\s*" + lang + "\\s*([\\s\\S]*?)\\s*```$",
        "i"
    );

    const m = str.trim().match(re);
    return m ? m[1].trim() : str;
}

function safeJsonParse(str) {
    const trimmed = (str || "").trim();

    const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    const payload = fenced ? fenced[1].trim() : trimmed;

    try {
        return JSON.parse(payload);
    } catch {
        return null;
    }
}

function extractCppFromJson(rawText) {
    if (!rawText) return { cpp: "", parsed: false };

    // Πιάσε ΟΠΟΙΟΔΗΠΟΤΕ fenced block
    const match = rawText.match(/```[\s\S]*?```/);

    let cpp = match ? match[0] : rawText;

    // Αφαίρεσε ``` και ```cpp
    cpp = cpp
        .replace(/```cpp/i, "")
        .replace(/```/g, "")
        .trim();

    // Κόψε ό,τι υπάρχει πριν από πραγματικό C++
    const start = cpp.search(/(#ifndef|#include|namespace|class)\b/);
    if (start !== -1) {
        cpp = cpp.slice(start);
    }

    return {
        cpp,
        parsed: !!match
    };
}

module.exports = { extractCppFromJson };

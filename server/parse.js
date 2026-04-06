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

function extractCppUmlFromJson(rawText) {
    const obj = safeJsonParse(rawText);
    if (!obj || typeof obj !== "object") {
        return { cpp: null, uml: null, parsed: false };
    }

    let cpp = typeof obj.cpp === "string" ? obj.cpp : null;
    let uml = typeof obj.uml === "string" ? obj.uml : null;

    if (cpp) cpp = stripFence(cpp, "cpp");
    if (uml) uml = stripFence(uml, "plantuml");

    return { cpp, uml, parsed: Boolean(cpp) };
}


function extractCppFromJson(rawText) {
    const fenceMatch = rawText.match(/```cpp\s*([\s\S]*?)```/);
    if (fenceMatch) {
        return { cpp: fenceMatch[1].trim(), parsed: true };
    }
    return { cpp: rawText, parsed: false };
}

module.exports = { extractCppUmlFromJson, extractCppFromJson };

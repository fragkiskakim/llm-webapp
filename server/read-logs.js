const fs = require("fs");
const path = require("path");

const logDir = path.join(__dirname, "logs");
const files = fs.readdirSync(logDir).filter(f => f.startsWith("local_models_"));

// Πάρε το πιο πρόσφατο
const latest = files.sort().at(-1);
const results = JSON.parse(fs.readFileSync(path.join(logDir, latest)));

const success = results.filter(r => r.ok);
const failed = results.filter(r => !r.ok);

console.log(`\n✅ Ολοκληρώθηκαν: ${success.length}/${results.length}`);
console.log(`❌ Απέτυχαν: ${failed.length}/${results.length}`);

console.log("\n📋 Ολοκληρωμένα πειράματα:");
success.forEach(r => {
    console.log(`  [${r.model}] [${r.architecture}] [${r.promptType}] [temp=${r.temperature}] run ${r.attempt} → id=${r.id}`);
});

if (failed.length > 0) {
    console.log("\n❌ Αποτυχημένα:");
    failed.forEach(r => {
        console.log(`  [${r.model}] [${r.architecture}] [${r.promptType}] [temp=${r.temperature}] run ${r.attempt} → ${r.error}`);
    });
}

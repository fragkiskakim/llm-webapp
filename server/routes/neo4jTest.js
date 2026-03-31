const express = require("express");
const driver = require("../neo4j");

const router = express.Router();

router.get("/neo4j-test", async (req, res) => {
    const session = driver.session({
        database: process.env.NEO4J_DATABASE,
    });

    try {
        const result = await session.run(
            "RETURN 'connected to neo4j' AS message"
        );

        res.json({
            ok: true,
            message: result.records[0].get("message"),
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        await session.close();
    }
});

module.exports = router;
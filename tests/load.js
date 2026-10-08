/* loads the rules engine (js/core) into Node, in the same order as index.html */
const path = require("path");
const ROOT = path.join(__dirname, "..");
["core", "data", "grid", "battle", "ai", "campaign"].forEach(f=>{
  try{ require(path.join(ROOT, "js/core", f + ".js")); }
  catch(e){ if(e.code !== "MODULE_NOT_FOUND") throw e; }
});
module.exports = globalThis.GS;

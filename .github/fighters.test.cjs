/* Offline test of js/fighters.js: every fighter key, name and common alias resolves to a name and a stock icon address.
   Run: node .github/fighters.test.cjs   (prints the table: key -> name -> icon) */
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const win = {};
new Function("window", fs.readFileSync(path.join(__dirname, "..", "js", "fighters.js"), "utf8"))(win);
const ICON = /^https:\/\/www\.ssbuarena\.com\/fighters\/[a-z_]+\/[1-8]\.webp$/;

// every key the points can be stored under: the list on the Mastery page, plus the game's other ui_chara keys
const GAME_EXTRA = ["popo", "nana", "ptrainer_low", "pzenigame", "pfushigisou", "plizardon", "eflame", "elight", "eflame_first",
  "elight_first", "eflame_only", "elight_only"];
const keys = win.OSU_FIGHTER_KEYS.concat(GAME_EXTRA);
assert.equal(win.OSU_FIGHTER_KEYS.length, 86, "86 fighters in the Mastery page's list");
assert.equal(new Set(win.OSU_FIGHTER_KEYS).size, 86, "no fighter twice");
const rows = [];
for (const k of keys) {
  const name = win.OSU_FIGHTER(k), icon = win.OSU_FIGHTER_ICON(k);
  assert.equal(win.OSU_FIGHTER_KEY(k), k, k + " is a key of its own");
  assert.ok(name && name !== k, k + " has a name");
  assert.ok(icon && ICON.test(icon.src) && icon.src2x === icon.src.replace(".webp", "@2x.webp"), k + " has an icon: " + JSON.stringify(icon));
  assert.equal(win.OSU_FIGHTER_KEY(name) && win.OSU_FIGHTER(win.OSU_FIGHTER_KEY(name)), name, "the name " + name + " resolves back");
  rows.push([k, name, icon.src.replace("https://www.ssbuarena.com/fighters/", "")]);
}
// names and aliases in any case, spacing or punctuation
const ALIASES = {
  joker: "jack", Joker: "jack", JOKER: "jack", "Pyra / Mythra": "element", "pyra/mythra": "element", pyra: "eflame", Mythra: "elight",
  pt: "ptrainer", PT: "ptrainer", "Pokemon Trainer": "ptrainer", "Pokémon Trainer": "ptrainer", "ice climbers": "ice_climber",
  "Ice Climbers": "ice_climber", ics: "ice_climber", "mii fighter": "miifighter", "Mii Brawler": "miifighter", mii: "miifighter",
  "mii swordfighter": "miiswordsman", "Mii Gunner": "miigunner", "Mr. Game & Watch": "gamewatch", "game and watch": "gamewatch",
  "R.O.B.": "robot", rob: "robot", "King K. Rool": "krool", "Banjo & Kazooie": "buddy", "Dr. Mario": "mariod", "Rosalina & Luma": "rosetta",
  hero: "brave", terry: "dolly", byleth: "master", "min min": "tantan", steve: "pickel", sephiroth: "edge", kazuya: "demon", sora: "trail",
  squirtle: "pzenigame", charizard: "plizardon", ivysaur: "pfushigisou", "donkey kong": "donkey", dk: "donkey", "zero suit samus": "szerosuit",
  zss: "szerosuit", "captain falcon": "captain", jigglypuff: "purin", bowser: "koopa", "bowser jr.": "koopajr", olimar: "pikmin",
  villager: "murabito", "mega man": "rockman", greninja: "gekkouga", robin: "reflet", corrin: "kamui", isabelle: "shizue",
  incineroar: "gaogaen", "piranha plant": "packun", "young link": "younglink", "toon link": "toonlink", "dark pit": "pitb"
};
for (const [a, k] of Object.entries(ALIASES)) {
  assert.equal(win.OSU_FIGHTER_KEY(a), k, JSON.stringify(a) + " -> " + k);
  assert.ok(win.OSU_FIGHTER_ICON(a), JSON.stringify(a) + " has an icon");
}
for (const bad of ["", null, undefined, "nobody", "<b>", "mario2"]) {
  assert.equal(win.OSU_FIGHTER_KEY(bad), null, String(bad) + " is no fighter");
  assert.equal(win.OSU_FIGHTER_ICON(bad), null);
}
assert.equal(win.OSU_FIGHTER("nobody"), "nobody", "an unknown fighter shows as given");
assert.equal(win.OSU_FIGHTER_ICON("ridley").src, "https://www.ssbuarena.com/fighters/ridley/5.webp", "Ridley has no costume 1");
for (const r of rows) console.log(r[0].padEnd(14) + r[1].padEnd(20) + r[2]);
console.log("fighters ok: " + rows.length + " keys and " + Object.keys(ALIASES).length + " aliases resolve to an icon");

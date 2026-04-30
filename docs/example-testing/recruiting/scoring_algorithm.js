/**
 * Candidate scoring algorithm used by the recruiting Skill.
 *
 * Invocation contract (Flowise Skill sandbox — NodeVM or E2B):
 *
 *     exec_skill_code_<Skill>({
 *       path: "skills/scoring_algorithm.js",
 *       args: [RESUME_TEXT, JD_TEXT]
 *     })
 *
 * The wrapper exposes `args` as `process.argv[2..]`, so inside the script
 * argv[2] is the resume text and argv[3] is the job-description text.
 *
 * Produces a JSON object written to stdout:
 *   {
 *     "technical_fit":    <0..10>,
 *     "experience_level": <0..10>,
 *     "culture_fit":      7.0,
 *     "overall":          <0..10>
 *   }
 *
 * Design constraints (intentional):
 *   - Stdlib only. No `require('fs')`, no `require('path')`, no network.
 *     The sandbox allowlist blocks `fs` and the script doesn't need it.
 *   - No file I/O — arguments are ALWAYS literal text. Paths referenced
 *     elsewhere in the skill markdown are for LLM context, not for this
 *     script to dereference.
 *   - Deterministic: same inputs → same scores, always.
 */

'use strict'

const STOP_WORDS = new Set([
    'a',
    'an',
    'the',
    'and',
    'or',
    'for',
    'of',
    'to',
    'in',
    'on',
    'with',
    'as',
    'at',
    'by',
    'from',
    'is',
    'are',
    'be',
    'been',
    'being',
    'we',
    'you',
    'our',
    'your',
    'this',
    'that',
    'it',
    'its',
    'into',
    'over',
    'up',
    'down',
    'across'
])

function tokens(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/[^a-z0-9+.#/\- ]+/g, ' ')
        .split(/\s+/)
        .filter((t) => t.length >= 2 && !STOP_WORDS.has(t))
}

function technicalScore(resumeText, jdText) {
    const jdTokens = Array.from(new Set(tokens(jdText)))
    if (jdTokens.length === 0) return 0
    const resumeSet = new Set(tokens(resumeText))
    const hits = jdTokens.filter((t) => resumeSet.has(t)).length
    const ratio = hits / jdTokens.length
    return Math.min(10, Math.round(ratio * 10 * 10) / 10)
}

function experienceScore(resumeText) {
    const matches = String(resumeText || '').match(/(\d{1,2})\s*\+?\s*years?/gi) || []
    let max = 0
    for (const m of matches) {
        const num = parseInt(m, 10)
        if (!Number.isNaN(num)) max = Math.max(max, num)
    }
    return Math.min(10, max)
}

function scoreCandidate(resumeText, jdText) {
    const technical = technicalScore(resumeText, jdText)
    const experience = experienceScore(resumeText)
    const culture = 7.0 // baseline; the LLM refines this qualitatively
    const overall = Math.round(((technical + experience + culture) / 3) * 10) / 10
    return {
        technical_fit: technical,
        experience_level: experience,
        culture_fit: culture,
        overall
    }
}

// Entry — read argv[2] (resume) and argv[3] (JD) verbatim.
const resume = process.argv[2] || ''
const jd = process.argv[3] || ''
const out = scoreCandidate(resume, jd)
process.stdout.write(JSON.stringify(out, null, 2))

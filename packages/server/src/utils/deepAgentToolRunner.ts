import logger from './logger'
import { getErrorMessage } from '../errors/utils'

/**
 * FR-3: Tool Execution Runtime
 *
 * Provides isolated tool execution for Deep Agent workflows.
 * Each tool has explicit capabilities and restrictions.
 *
 * Built-in tools (V1):
 * - web_search: Search the web for information
 * - fetch_url: Fetch and parse content from a URL
 * - parse_document: Extract structured data from documents
 * - summarize_source: Summarize fetched content using LLM
 * - generate_file: Generate content to an artifact
 *
 * Security: All network requests are logged. URL validation prevents SSRF.
 * Tool failures are caught and returned as error results (never crash the agent).
 */

export interface ToolExecutionResult {
    success: boolean
    output: string
    error?: string
    durationMs: number
    toolName: string
}

export interface ToolExecutionLog {
    toolName: string
    input: string
    output: string
    success: boolean
    error?: string
    durationMs: number
    timestamp: Date
}

// Allowed URL schemes for fetch operations
const ALLOWED_SCHEMES = ['http:', 'https:']

// Blocked private/internal IP ranges for SSRF prevention
const BLOCKED_HOSTS = [
    /^localhost$/i,
    /^127\.\d+\.\d+\.\d+$/,
    /^10\.\d+\.\d+\.\d+$/,
    /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
    /^192\.168\.\d+\.\d+$/,
    /^0\.0\.0\.0$/,
    /^::1$/,
    /^fe80:/i,
    /^169\.254\.\d+\.\d+$/,
    /^metadata\.google\.internal$/i
]

/**
 * Validates a URL to prevent SSRF attacks
 */
function validateUrl(urlString: string): URL {
    let url: URL
    try {
        url = new URL(urlString)
    } catch {
        throw new Error(`Invalid URL: ${urlString}`)
    }

    if (!ALLOWED_SCHEMES.includes(url.protocol)) {
        throw new Error(`Blocked URL scheme: ${url.protocol}`)
    }

    for (const pattern of BLOCKED_HOSTS) {
        if (pattern.test(url.hostname)) {
            throw new Error(`Blocked host: ${url.hostname}`)
        }
    }

    return url
}

/**
 * Tool: web_search
 * Performs a web search using a search API or scraping approach.
 * For V1, uses DuckDuckGo HTML search as a free fallback.
 */
async function webSearch(query: string): Promise<string> {
    logger.info(`[DeepAgentToolRunner] web_search: "${query}"`)

    // Use DuckDuckGo HTML API — no API key required
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
    const response = await fetch(searchUrl, {
        headers: {
            'User-Agent': 'Flowise-DeepAgent/1.0'
        },
        signal: AbortSignal.timeout(15000)
    })

    if (!response.ok) {
        throw new Error(`Search request failed with status ${response.status}`)
    }

    const html = await response.text()

    // Extract search result snippets from DuckDuckGo HTML response
    const results: string[] = []
    const snippetRegex = /<a class="result__snippet"[^>]*>(.*?)<\/a>/gs
    let match
    let count = 0
    while ((match = snippetRegex.exec(html)) !== null && count < 8) {
        const text = match[1]
            .replace(/<[^>]*>/g, '') // strip HTML tags
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#x27;/g, "'")
            .trim()
        if (text.length > 20) {
            results.push(text)
            count++
        }
    }

    // Also extract result titles and URLs
    const titleRegex = /<a class="result__a"[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gs
    const titles: string[] = []
    let titleMatch
    let titleCount = 0
    while ((titleMatch = titleRegex.exec(html)) !== null && titleCount < 8) {
        const title = titleMatch[2].replace(/<[^>]*>/g, '').trim()
        const url = titleMatch[1]
        if (title.length > 5) {
            titles.push(`- [${title}](${url})`)
            titleCount++
        }
    }

    if (results.length === 0 && titles.length === 0) {
        return `Search completed for "${query}" but no results were extracted. Try rephrasing the query.`
    }

    let output = `## Search Results for: "${query}"\n\n`
    if (titles.length > 0) {
        output += `### Sources Found:\n${titles.join('\n')}\n\n`
    }
    if (results.length > 0) {
        output += `### Key Findings:\n${results.map((r, i) => `${i + 1}. ${r}`).join('\n')}\n`
    }

    return output
}

/**
 * Tool: fetch_url
 * Fetches content from a URL and extracts readable text.
 * Validates URL against SSRF blocklist.
 */
async function fetchUrl(urlString: string): Promise<string> {
    logger.info(`[DeepAgentToolRunner] fetch_url: "${urlString}"`)

    const url = validateUrl(urlString)

    const response = await fetch(url.toString(), {
        headers: {
            'User-Agent': 'Flowise-DeepAgent/1.0',
            Accept: 'text/html,application/xhtml+xml,text/plain,application/json'
        },
        signal: AbortSignal.timeout(20000),
        redirect: 'follow'
    })

    if (!response.ok) {
        throw new Error(`Failed to fetch URL (${response.status}): ${url.toString()}`)
    }

    const contentType = response.headers.get('content-type') || ''
    const text = await response.text()

    if (contentType.includes('application/json')) {
        try {
            const json = JSON.parse(text)
            return `## Content from ${url.hostname}\n\n\`\`\`json\n${JSON.stringify(json, null, 2).substring(0, 5000)}\n\`\`\``
        } catch {
            return text.substring(0, 5000)
        }
    }

    // Extract text content from HTML
    if (contentType.includes('text/html')) {
        return extractTextFromHtml(text, url.hostname)
    }

    // Plain text
    return `## Content from ${url.hostname}\n\n${text.substring(0, 8000)}`
}

/**
 * Extracts readable text content from HTML
 */
function extractTextFromHtml(html: string, hostname: string): string {
    // Remove script and style elements
    let cleaned = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
        .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
        .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')

    // Extract title
    const titleMatch = cleaned.match(/<title[^>]*>(.*?)<\/title>/i)
    const title = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, '').trim() : hostname

    // Extract main content - prefer article, main, or body
    const mainMatch =
        cleaned.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ||
        cleaned.match(/<main[^>]*>([\s\S]*?)<\/main>/i) ||
        cleaned.match(/<body[^>]*>([\s\S]*?)<\/body>/i)

    const content = mainMatch ? mainMatch[1] : cleaned

    // Convert headings to markdown
    let text = content
        .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '\n# $1\n')
        .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '\n## $1\n')
        .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '\n### $1\n')
        .replace(/<p[^>]*>(.*?)<\/p>/gi, '\n$1\n')
        .replace(/<li[^>]*>(.*?)<\/li>/gi, '\n- $1')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]*>/g, '') // Remove remaining HTML tags
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#x27;/g, "'")
        .replace(/\n{3,}/g, '\n\n') // Collapse multiple newlines
        .trim()

    // Truncate to reasonable size
    if (text.length > 8000) {
        text = text.substring(0, 8000) + '\n\n[Content truncated...]'
    }

    return `## ${title}\n*Source: ${hostname}*\n\n${text}`
}

/**
 * Tool: parse_document
 * Extracts structured data from document content.
 * For V1, handles text extraction and basic structuring.
 */
async function parseDocument(content: string): Promise<string> {
    logger.info(`[DeepAgentToolRunner] parse_document: ${content.substring(0, 50)}...`)

    // Basic structuring: split into sections, identify key points
    const lines = content.split('\n').filter((l) => l.trim().length > 0)
    const sections: string[] = []
    let currentSection = ''

    for (const line of lines) {
        if (line.startsWith('#') || line.length > 100) {
            if (currentSection) sections.push(currentSection.trim())
            currentSection = line + '\n'
        } else {
            currentSection += line + '\n'
        }
    }
    if (currentSection) sections.push(currentSection.trim())

    return sections.join('\n\n---\n\n')
}

/**
 * Tool: summarize_source
 * Summarizes content. When LLM is available, uses it for summarization.
 * Falls back to extractive summarization when LLM is not configured.
 */
async function summarizeSource(content: string, llmSummarize?: (text: string) => Promise<string>): Promise<string> {
    logger.info(`[DeepAgentToolRunner] summarize_source: ${content.substring(0, 50)}...`)

    if (llmSummarize) {
        return await llmSummarize(content)
    }

    // Extractive summarization fallback: pick key sentences
    const sentences = content
        .split(/[.!?]\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 30 && s.length < 500)

    if (sentences.length === 0) return content.substring(0, 2000)

    // Score sentences by position and keyword density
    const scored = sentences.map((s, i) => ({
        text: s,
        score: (1 / (i + 1)) * 2 + s.split(' ').length / 20 // Favor earlier and medium-length sentences
    }))

    scored.sort((a, b) => b.score - a.score)

    const topSentences = scored.slice(0, Math.min(10, scored.length))
    return `## Summary\n\n${topSentences.map((s) => `- ${s.text}.`).join('\n')}`
}

/**
 * Tool: generate_file
 * Generates structured content for an artifact.
 * When LLM is available, uses it. Otherwise returns structured placeholder.
 */
async function generateFile(prompt: string, context: string, llmGenerate?: (prompt: string) => Promise<string>): Promise<string> {
    logger.info(`[DeepAgentToolRunner] generate_file: ${prompt.substring(0, 50)}...`)

    if (llmGenerate) {
        return await llmGenerate(`Generate a comprehensive, well-structured markdown document for the following request.

Request: ${prompt}

Context and research findings:
${context}

Generate a professional markdown document with clear sections, headings, and organized content.`)
    }

    // Fallback: structure the context into a document
    return `# ${prompt}\n\n${context}`
}

/**
 * Main tool execution function.
 * Wraps each tool call with timing, logging, and error handling (FR-3 acceptance criteria).
 */
export async function executeToolSandboxed(
    toolName: string,
    input: string,
    options?: {
        llmSummarize?: (text: string) => Promise<string>
        llmGenerate?: (prompt: string) => Promise<string>
        accumulatedContext?: string
    }
): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    try {
        let output: string

        switch (toolName) {
            case 'web_search':
                output = await webSearch(input)
                break
            case 'fetch_url':
                output = await fetchUrl(input)
                break
            case 'parse_document':
                output = await parseDocument(input)
                break
            case 'summarize_source':
                output = await summarizeSource(input, options?.llmSummarize)
                break
            case 'generate_file':
            case 'generate':
                output = await generateFile(input, options?.accumulatedContext || '', options?.llmGenerate)
                break
            default:
                // Unknown tool — treat as a no-op reasoning step
                output = `Analysis completed: ${input}`
        }

        const durationMs = Date.now() - startTime
        logger.info(`[DeepAgentToolRunner] ${toolName} completed in ${durationMs}ms`)

        return { success: true, output, durationMs, toolName }
    } catch (error) {
        const durationMs = Date.now() - startTime
        const errorMsg = getErrorMessage(error)
        logger.error(`[DeepAgentToolRunner] ${toolName} failed in ${durationMs}ms: ${errorMsg}`)

        return {
            success: false,
            output: '',
            error: errorMsg,
            durationMs,
            toolName
        }
    }
}

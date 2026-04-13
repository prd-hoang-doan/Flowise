import { ISkillNode } from '../../Interface'

const EMBEDDING_PREFIXES: Record<string, string> = {
    role: 'Role: ',
    rule: 'Rule: ',
    behavior: 'Instruction: ',
    knowledge: 'Knowledge: ',
    asset: 'Asset: '
}

/**
 * Prepare embedding text for a skill node.
 * Adds type-aware prefix and appends trigger keywords.
 */
export function prepareEmbeddingText(node: ISkillNode): string {
    const prefix = EMBEDDING_PREFIXES[node.type] || ''
    const triggers = node.triggers ? ` [${JSON.parse(node.triggers).join(', ')}]` : ''
    return `${prefix}${node.content}${triggers}`
}

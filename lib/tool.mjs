/**
 * Optional agent-facing tool: let the model raise an explicit desktop
 * notification (the closest equivalent to Codex's `notify` hook, but available
 * to the agent at any point, not only on turn completion).
 *
 * The tool is only registered when the user enables `agentTool` in settings.
 */

function clip(value, max) {
  if (typeof value !== 'string') return ''
  const characters = Array.from(value.trim())
  return characters.length <= max ? characters.join('') : `${characters.slice(0, max - 1).join('')}…`
}

/**
 * @param {object} options
 * @param {() => object} options.getConfig
 * @param {(input: {title?: string, body?: string, urgent?: boolean, sessionId?: string}) => {delivered: boolean, platform: string}} options.notifyCustom
 * @param {(message: string) => void} [options.logger]
 */
export function buildAgentTool(options) {
  const getConfig = options.getConfig
  const notifyCustom = options.notifyCustom
  const logger = typeof options.logger === 'function' ? options.logger : () => {}

  const definition = {
    name: 'send_desktop_notification',
    description:
      'Send an explicit desktop notification to the user (system toast + configured sound). Use it when the user asked to be pinged, or when a long-running step needs attention. It is independent of the automatic turn-complete notifications.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        title: {
          type: 'string',
          description: 'Bold notification title. Keep it short (max ~60 characters).'
        },
        body: {
          type: 'string',
          description: 'Optional body text. Keep it under ~200 characters.'
        },
        urgent: {
          type: 'boolean',
          description: 'Use the error sound and critical urgency.'
        }
      },
      required: ['title']
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          delivered: { type: 'boolean' },
          platform: { type: 'string' }
        },
        required: ['delivered', 'platform']
      },
      render: (_args, value) => [
        {
          type: 'text',
          text: value && value.delivered
            ? `Desktop notification sent on ${value.platform}.`
            : 'Desktop notification was not sent (the plugin is disabled or no backend is available).'
        }
      ]
    },
    async execute(args) {
      const config = getConfig()
      if (!config || config.enabled !== true || config.agentTool !== true) {
        return { delivered: false, platform: process.platform }
      }
      const title = clip(args && args.title, 120)
      const body = clip(args && args.body, 400)
      if (!title) return { delivered: false, platform: process.platform }
      try {
        const result = notifyCustom({
          title,
          body,
          urgent: Boolean(args && args.urgent)
        })
        return { delivered: result.delivered === true, platform: process.platform }
      } catch (error) {
        logger(`[dsh-system-notify] agent notification failed: ${error.message}`)
        return { delivered: false, platform: process.platform }
      }
    }
  }

  return definition
}

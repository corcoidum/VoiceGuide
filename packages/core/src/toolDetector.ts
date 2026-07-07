import type { GuidePack, ScreenContext, ToolDetection } from './types.js';

/**
 * Combines whatever signals are available (user selection, URL domain,
 * page/window title) into a detection with an explicit confidence score
 * and human-readable evidence. Never guesses beyond its signals.
 */
export class ToolDetector {
  constructor(private readonly packs: GuidePack[]) {}

  detect(context: ScreenContext | null, userSelectedToolId?: string): ToolDetection {
    if (userSelectedToolId) {
      const pack = this.packs.find((p) => p.toolId === userSelectedToolId);
      return {
        toolId: userSelectedToolId,
        toolName: pack?.toolName ?? userSelectedToolId,
        confidence: 1,
        evidence: ['사용자가 도구를 직접 선택했습니다.'],
      };
    }

    if (!context) {
      return {
        toolId: null,
        toolName: '알 수 없음',
        confidence: 0,
        evidence: ['사용 가능한 화면 정보가 없습니다.'],
      };
    }

    const url = context.browser?.url ?? '';
    const title = context.browser?.title ?? context.activeWindowTitle ?? '';

    // 1) Domain match against Guide Pack supportedDomains — strongest signal.
    if (url) {
      let hostname = '';
      try {
        hostname = new URL(url).hostname.toLowerCase();
      } catch {
        hostname = '';
      }
      if (hostname) {
        for (const pack of this.packs) {
          if (
            pack.supportedDomains.some(
              (d) => hostname === d || hostname.endsWith(`.${d}`),
            )
          ) {
            return {
              toolId: pack.toolId,
              toolName: pack.toolName,
              confidence: 0.9,
              evidence: [`현재 페이지 도메인(${hostname})이 ${pack.toolName}과 일치합니다.`],
            };
          }
        }
      }
    }

    // 2) Title keyword match — weaker signal.
    if (title) {
      const lower = title.toLowerCase();
      for (const pack of this.packs) {
        if (lower.includes(pack.toolName.toLowerCase())) {
          return {
            toolId: pack.toolId,
            toolName: pack.toolName,
            confidence: 0.6,
            evidence: [`창/페이지 제목("${title}")에 ${pack.toolName}이(가) 포함되어 있습니다.`],
          };
        }
      }
    }

    // 3) Unknown tool but we at least know where the user is.
    if (url || title) {
      const label = title || url;
      return {
        toolId: null,
        toolName: label,
        confidence: 0.3,
        evidence: [
          `전용 Guide Pack이 없는 도구입니다. Generic Guide Mode로 안내합니다.`,
          url ? `URL: ${url}` : `창 제목: ${title}`,
        ],
      };
    }

    return {
      toolId: null,
      toolName: '알 수 없음',
      confidence: 0,
      evidence: ['URL이나 창 제목 정보가 없어 도구를 식별하지 못했습니다.'],
    };
  }
}

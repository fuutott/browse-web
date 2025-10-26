import ipaddr from "ipaddr.js";
import { RequestPayload, downloadLimit, WebsiteResult } from "./types.js";

export class Fetcher {
  private static applyLengthLimits(text: string, maxLength: number, startIndex: number): string {
    if (startIndex >= text.length) {
      return "";
    }
    
    const end = maxLength > 0 ? Math.min(startIndex + maxLength, text.length) : text.length;
    return text.substring(startIndex, end);
  }

  private static spoofHeaders(url: string): Record<string, string> {
    const spoofedUserAgents = [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Linux; Android 10; SM-M515F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.141 Mobile Safari/537.36",
      "Mozilla/5.0 (Linux; Android 6.0; E5533) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.101 Mobile Safari/537.36",
      "Mozilla/5.0 (Linux; Android 8.1.0; AX1082) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.83 Mobile Safari/537.36",
      "Mozilla/5.0 (Linux; Android 8.1.0; TM-MID1020A) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.96 Safari/537.36",
      "Mozilla/5.0 (Linux; Android 9; POT-LX1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.45 Mobile Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/97.0.4692.71 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.80 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Safari/605.1.15",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3.1 Safari/605.1.15",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:97.0) Gecko/20100101 Firefox/97.0",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36 Edg/134.0.0.0",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/97.0.4692.71 Safari/537.36 Edg/97.0.1072.71",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/97.0.4692.71 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.80 Safari/537.36 Edg/98.0.1108.62",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.80 Safari/537.36",
      "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/97.0.4692.71 Safari/537.36",
      "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:97.0) Gecko/20100101 Firefox/97.0",
      "Opera/9.80 (Android 7.0; Opera Mini/36.2.2254/119.132; U; id) Presto/2.12.423 Version/12.16",
    ];

    const domain = new URL(url).hostname;
    return {
      'User-Agent': spoofedUserAgents[Math.floor(Math.random() * spoofedUserAgents.length)],
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Referer': 'https://' + domain + '/',
      'Origin': 'https://' + domain,
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Cache-Control': 'max-age=0',
    };
  }

  private static async _fetch({
    url,
    headers,
  }: RequestPayload): Promise<Response> {
    try {
      // Extract hostname from URL and check if it's a private IP
      const hostname = new URL(url).hostname;
      
      // Check if hostname is an IP address and if it's private
      if (ipaddr.isValid(hostname)) {
        const addr = ipaddr.process(hostname);
        const range = addr.range();
        
        // Block private, loopback, linkLocal, multicast, and other non-public ranges
        if (range === 'private' || range === 'loopback' || range === 'linkLocal' || 
            range === 'multicast' || range === 'broadcast' || range === 'reserved') {
          throw new Error(
            `Fetcher blocked an attempt to fetch a private IP ${hostname}. This is to prevent a security vulnerability where a local MCP could fetch privileged local IPs and exfiltrate data.`,
          );
        }
      }
      
      const defaultHeaders = this.spoofHeaders(url);
      const response = await fetch(url, {
        headers: {
          ...defaultHeaders,
          ...headers,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }
      return response;
    } catch (e: unknown) {
      if (e instanceof Error) {
        throw new Error(`Failed to fetch ${url}: ${e.message}`);
      } else {
        throw new Error(`Failed to fetch ${url}: Unknown error`);
      }
    }
  }

  private static extractLinks(body: string, url: string, maxLinks: number, searchTerms?: string[]): [string, string][] {
    return [...body.matchAll(/<a\s+[^>]*?href="([^"]+)"[^>]*>((?:\n|.)*?)<\/a>/g)]
      .map((match, index) => ({
        index,
        label: match[2]?.replace(/\\[ntr]|\s|<(?:[^>"]|"[^"]*")+>/g, " ").trim() || "",
        link: match[1]?.startsWith("/")
          ? new URL(match[1], url).href
          : match[1],
      }))
      .filter(({ link }) => link?.startsWith("http"))
      .map((x, index, { length }) => {
        // Prioritize links fitting the search terms
        // Followed by short navigation links and content links with long labels
        // Fewer digits = more likely a navigation link than a content link
        const ratio = 1 / Math.min(1, /\d/g.exec(x.link)?.length || 1);
        const score
          = ratio * (100 - (x.label.length + x.link.length + (20 * index / length)))
          + (1 - ratio) * x.label.split(/\s+/).length;
        return {
          ...x,
          score: searchTerms?.length
            && searchTerms.reduce((acc, term) => acc + (x.label.toLowerCase().includes(term.toLowerCase()) ? 1000 : 0), score)
            || score,
        };
      })
      .sort((a, b) => b.score - a.score) // Sort by score in descending order
      .filter((x, i, arr) =>
        // Filter out duplicates based on link, keeping the first occurrence
        !arr.find((y, j) => j < i && y.link === x.link)
      )
      .slice(0, maxLinks) // Limit number of links
      .map(({ label, link }) => [label, link] as [string, string]);
  }

  static async fetch(requestPayload: RequestPayload) {
    try {
      const response = await this._fetch(requestPayload);
      const html = await response.text();
      
      // Extract head and body sections like example.js
      const headStart = html.indexOf("<head>");
      const headEnd = html.indexOf("</head>") + 7;
      const head = html.substring(headStart, headEnd);
      const bodyStart = html.match(/<body[^>]*>/)?.index || 0;
      const bodyEnd = html.lastIndexOf("</body>") || html.length - 1;
      const body = html.substring(bodyStart, bodyEnd);

      // Extract metadata
      const title = head.match(/<title>([^<]*)<\/title>/)?.[1] || "";
      const h1 = body.match(/<h1[^>]*>([^<]*)<\/h1>/)?.[1] || "";
      const h2 = body.match(/<h2[^>]*>([^<]*)<\/h2>/)?.[1] || "";
      const h3 = body.match(/<h3[^>]*>([^<]*)<\/h3>/)?.[1] || "";

      // Extract links if requested
      const maxLinks = requestPayload.maxLinks ?? 40;
      const links = maxLinks > 0 ? this.extractLinks(body, requestPayload.url, maxLinks, requestPayload.findInPage) : undefined;

      // Extract text content
      const contentLimit = requestPayload.max_length ?? downloadLimit;
      const searchTerms = requestPayload.findInPage;
      
      const allContent = contentLimit > 0 ? body
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // Remove script tags
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // Remove style tags
        .replace(/<[^>]+>/g, '') // Remove all HTML tags
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim() : '';
      
      let content = "";
      if (searchTerms?.length && contentLimit < allContent.length) {
        const padding = `.{0,${Math.floor(contentLimit / (searchTerms.length * 2))}}`;
        const matches = searchTerms
          .map(term => new RegExp(padding + term + padding, 'gi').exec(allContent))
          .filter(match => !!match)
          .sort((a, b) => a!.index - b!.index); // Sort by index in the content
        let nextMinIndex = 0;
        for (const match of matches) {
          if (match) {
            // Ensure we don't return duplicates by merging overlapping matches
            content += match.index >= nextMinIndex
              // The Match does not overlap with the previous one
              ? match[0]
              // The match overlaps so we just extend the content to include it
              : match[0].slice(nextMinIndex - match.index);
            nextMinIndex = match.index + match[0].length;
          }
        }
      } else {
        content = this.applyLengthLimits(allContent, contentLimit, requestPayload.start_index ?? 0);
      }

      const result: WebsiteResult = {
        url: requestPayload.url,
        title,
        h1,
        h2,
        h3,
        ...(links && links.length > 0 ? { links } : {}),
        ...(content ? { content } : {}),
      };

      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], isError: false };
    } catch (error) {
      return {
        content: [{ type: "text", text: (error as Error).message }],
        isError: true,
      };
    }
  }

  // Keep the old markdown method for backward compatibility but deprecate it
  static async markdown(requestPayload: RequestPayload) {
    return this.fetch(requestPayload);
  }
}

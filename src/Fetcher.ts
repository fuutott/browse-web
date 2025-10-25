import { JSDOM } from "jsdom";
import TurndownService from "turndown";
import ipaddr from "ipaddr.js";
import { RequestPayload, downloadLimit } from "./types.js";

export class Fetcher {
  private static applyLengthLimits(text: string, maxLength: number, startIndex: number): string {
    if (startIndex >= text.length) {
      return "";
    }
    
    const end = maxLength > 0 ? Math.min(startIndex + maxLength, text.length) : text.length;
    return text.substring(startIndex, end);
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
      
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 OPR/122.0.0.0",
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

  static async html(requestPayload: RequestPayload) {
    try {
      const response = await this._fetch(requestPayload);
      let html = await response.text();
      
      // Apply length limits
      html = this.applyLengthLimits(
        html, 
        requestPayload.max_length ?? downloadLimit, 
        requestPayload.start_index ?? 0
      );
      
      return { content: [{ type: "text", text: html }], isError: false };
    } catch (error) {
      return {
        content: [{ type: "text", text: (error as Error).message }],
        isError: true,
      };
    }
  }

  static async markdown(requestPayload: RequestPayload) {
    try {
      const response = await this._fetch(requestPayload);
      const html = await response.text();
      const turndownService = new TurndownService();
      let markdown = turndownService.turndown(html);
      
      // Apply length limits
      markdown = this.applyLengthLimits(
        markdown,
        requestPayload.max_length ?? downloadLimit,
        requestPayload.start_index ?? 0
      );
      
      return { content: [{ type: "text", text: markdown }], isError: false };
    } catch (error) {
      return {
        content: [{ type: "text", text: (error as Error).message }],
        isError: true,
      };
    }
  }
}

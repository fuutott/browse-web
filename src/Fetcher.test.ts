import { Fetcher } from "./Fetcher";

global.fetch = jest.fn();

describe("Fetcher", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockRequest = {
    url: "https://example.com",
    headers: { "Custom-Header": "Value" },
  };

  const mockHtml = `
    <html>
      <head>
        <title>Test Page</title>
        <script>console.log('This should be removed');</script>
        <style>body { color: red; }</style>
      </head>
      <body>
        <h1>Hello World</h1>
        <p>This is a test paragraph.</p>
      </body>
    </html>
  `;

  describe("fetch", () => {
    it("should extract structured data from HTML", async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: jest.fn().mockResolvedValueOnce(mockHtml),
      });

      const result = await Fetcher.fetch(mockRequest);
      
      const expectedResult = {
        url: "https://example.com",
        title: "Test Page",
        h1: "Hello World",
        h2: "",
        h3: "",
        content: "Hello World This is a test paragraph."
      };
      
      expect(result).toEqual({
        content: [{ type: "text", text: JSON.stringify(expectedResult, null, 2) }],
        isError: false,
      });
    });

    it("should handle errors", async () => {
      (fetch as jest.Mock).mockRejectedValueOnce(new Error("Network error"));

      const result = await Fetcher.fetch(mockRequest);
      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: "Failed to fetch https://example.com: Network error",
          },
        ],
        isError: true,
      });
    });
  });

  describe("markdown (backward compatibility)", () => {
    it("should work the same as fetch", async () => {
      const mockFetch = jest.fn()
        .mockResolvedValueOnce({
          ok: true,
          text: jest.fn().mockResolvedValueOnce(mockHtml),
        })
        .mockResolvedValueOnce({
          ok: true,
          text: jest.fn().mockResolvedValueOnce(mockHtml),
        });
      
      (fetch as jest.Mock) = mockFetch;

      const fetchResult = await Fetcher.fetch(mockRequest);
      const markdownResult = await Fetcher.markdown(mockRequest);
      
      expect(fetchResult).toEqual(markdownResult);
    });
  });

  describe("error handling", () => {
    it("should handle non-OK responses", async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const result = await Fetcher.fetch(mockRequest);
      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: "Failed to fetch https://example.com: HTTP error: 404",
          },
        ],
        isError: true,
      });
    });

    it("should handle unknown errors", async () => {
      (fetch as jest.Mock).mockRejectedValueOnce("Unknown error");

      const result = await Fetcher.fetch(mockRequest);
      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: "Failed to fetch https://example.com: Unknown error",
          },
        ],
        isError: true,
      });
    });
  });
});

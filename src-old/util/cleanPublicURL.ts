/**
 * Cleans a PUBLIC_URL environment variable by:
 * - Removing http:// or https:// protocol
 * - Removing port numbers from ngrok URLs (since ngrok forwards automatically)
 * @param url - The URL string to clean (can be undefined)
 * @returns The cleaned URL string, or null if there's an error
 */
export default function cleanPublicURL(url: string | undefined): string | null {
  if (!url) return null;

  let cleanedURL = url;

  // Remove http:// or https:// protocol
  if (/^https?:\/\//.test(cleanedURL)) {
    const splitResult = cleanedURL.split(/^https?:\/\//)[1];
    if (!splitResult) return null; // Malformed URL
    cleanedURL = splitResult;
  }

  // Clean ngrok URLs that contain ports
  const isNgrok = cleanedURL.includes(".ngrok-free.app");
  if (isNgrok && cleanedURL.includes(":")) {
    console.warn("PUBLIC_URL is Ngrok and contains a port. Ports should be automatically forwarded by ngrok.");
    console.warn("Cleaning URL...");
    const portMatch = cleanedURL.match(/:\d{1,5}/);
    if (portMatch) {
      const indexOfPort = cleanedURL.indexOf(portMatch[0]);
      cleanedURL = cleanedURL.slice(0, indexOfPort) + cleanedURL.slice(indexOfPort + portMatch[0].length);
    }
  }

  return cleanedURL;
}

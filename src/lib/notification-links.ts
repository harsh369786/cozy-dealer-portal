/** Resolve dealer notification links from API into valid in-app routes. */
export function resolveDealerNotificationLink(link: string): {
  to: string;
  params?: Record<string, string>;
  search?: Record<string, string>;
} {
  if (link.startsWith("/orders/")) {
    const orderId = link.split("/").pop()!;
    return { to: "/orders/$orderId", params: { orderId } };
  }

  if (link.startsWith("/products/")) {
    const rest = link.slice("/products/".length);
    const [productIdRaw, query] = rest.split("?");
    const productId = productIdRaw ?? "";
    const search: Record<string, string> = {};
    if (query) {
      for (const part of query.split("&")) {
        const [k, v] = part.split("=");
        if (k && v) search[k] = decodeURIComponent(v);
      }
    }
    return { to: "/products/$productId", params: { productId }, ...(Object.keys(search).length ? { search } : {}) };
  }

  if (link.startsWith("/campaigns/")) {
    const campaignId = link.split("/").pop()!;
    return { to: "/campaigns/$campaignId", params: { campaignId } };
  }

  if (link.startsWith("/complaints/")) {
    const complaintId = link.split("/").pop()!;
    return { to: "/complaints/$complaintId", params: { complaintId } };
  }

  if (link === "/profile" || link === "/rewards" || link === "/home") {
    return { to: link };
  }

  if (link === "/" || link === "/index") {
    return { to: "/home" };
  }

  if (link === "/campaigns" || link === "/complaints") {
    return { to: link };
  }

  if (link.startsWith("/admin/notifications") || link.startsWith("/distributor/notifications")) {
    return { to: link.split("?")[0] as "/admin/notifications" | "/distributor/notifications" };
  }

  return { to: "/home" };
}

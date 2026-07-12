export const EMAILJS_SERVICE_ID  = "VOTRE_SERVICE_ID";   // ex: "service_abc123"

export const EMAILJS_TEMPLATE_ID = "VOTRE_TEMPLATE_ID";  // ex: "template_xyz789"

export const EMAILJS_PUBLIC_KEY  = "VOTRE_PUBLIC_KEY";   // ex: "user_ABCDEFGH"

export async function sendRealEmail({ to, toName, from, subject, body, invoiceDetails, extraRecipients }) {
  // Charger EmailJS dynamiquement si pas encore chargé
  if (!window.emailjs) {
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js";
      s.onload = () => { window.emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY }); resolve(); };
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  const params = {
    to_email:         to,
    to_name:          toName || to,
    from_name:        from || "CHNCAK PharmaStock",
    reply_to:         "pharmastock@chncak.sn",
    subject:          subject,
    message:          body,
    invoice_details:  invoiceDetails || "",
    extra_recipients: extraRecipients || "",
  };
  const result = await window.emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, params);
  return result;
}

export function openMailClient({ to, subject, body }) {
  const mailtoLink =
    `mailto:${encodeURIComponent(to || "")}` +
    `?subject=${encodeURIComponent(subject || "")}` +
    `&body=${encodeURIComponent(body || "")}`;
  window.open(mailtoLink, "_blank");
}

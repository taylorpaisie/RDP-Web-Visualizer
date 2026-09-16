// Contact information for the RDP Web Visualizer footer.
(() => {
  function installContact() {
    const footer = document.querySelector('.footer');
    if (!footer || footer.querySelector('.footer-contact')) return;

    if (!document.querySelector('#footer-contact-styles')) {
      const style = document.createElement('style');
      style.id = 'footer-contact-styles';
      style.textContent = `
        .footer-contact{display:inline-flex;align-items:center;gap:7px;color:#a9b7c9;font-weight:650}
        .footer-contact a{color:#93c5fd;text-decoration:none;font-weight:760}
        .footer-contact a:hover{text-decoration:underline;color:#bfdbfe}
        .footer-contact-separator{color:#52647d}
        @media(max-width:620px){.footer-contact{width:100%;justify-content:center;flex-wrap:wrap}}
      `;
      document.head.append(style);
    }

    const contact = document.createElement('span');
    contact.className = 'footer-contact';

    const name = document.createElement('span');
    name.textContent = 'Taylor K. Paisie';

    const separator = document.createElement('span');
    separator.className = 'footer-contact-separator';
    separator.textContent = '·';

    const email = document.createElement('a');
    email.href = 'mailto:tpaisie91@gmail.com';
    email.textContent = 'tpaisie91@gmail.com';
    email.setAttribute('aria-label', 'Email Taylor K. Paisie');

    contact.append(name, separator, email);
    footer.prepend(contact);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installContact, { once: true });
  } else {
    installContact();
  }
})();

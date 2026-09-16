// Contact information for the RDP Web Visualizer footer.
window.addEventListener('DOMContentLoaded', () => {
  const footer = document.querySelector('.footer');
  if (!footer || footer.querySelector('.footer-contact')) return;

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
});

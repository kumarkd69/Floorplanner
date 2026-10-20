// All site-wide settings live here. Swap the placeholders before launch.
export const config = {
  siteName: 'Namma RCB HQ',

  // normal | matchweek | live — swaps banner slide 1 (phase 2)
  matchState: 'normal',

  whatsapp: {
    groupInvite: 'https://chat.whatsapp.com/REPLACE_WITH_INVITE_CODE',
    adminNumber: '919000000000', // country code + number, no "+"
    adminMessage: 'Namaskara! I want to join the Namma RCB HQ army. Where do I start?',
  },

  socials: {
    instagram: 'https://instagram.com/',
    youtube: 'https://youtube.com/',
    x: 'https://x.com/',
    facebook: 'https://facebook.com/',
  },

  // Registration endpoint (phase 2). null = stubbed locally.
  registrationEndpoint: null,

  contactEmail: 'hello@nammarcbhq.example',
};

export const waAdminLink = (text = config.whatsapp.adminMessage) =>
  `https://wa.me/${config.whatsapp.adminNumber}?text=${encodeURIComponent(text)}`;

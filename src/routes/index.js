const router = require('koa-router')()

const { BASE_URL, PEER_CONNECTION, LIVE_ROOM, TRANSPORT_CONTROL_AND_STAT, TEXT_CHAT } = require('../common/constant');

router.get('/', async (ctx, next) => {
  await ctx.render('index', {
    title: 'Hello WebRTC',
    links: [
      { content: 'PeerConnection', url: `${BASE_URL}/${PEER_CONNECTION}` },
      { content: '1v1 Live Room', url: `${BASE_URL}/${LIVE_ROOM}` },
      { content: 'transport control and stat', url: `${BASE_URL}/${TRANSPORT_CONTROL_AND_STAT}` },
      { content: 'text chat', url: `${BASE_URL}/${TEXT_CHAT}` },
    ]
  });
})

router.get(`/${PEER_CONNECTION}`, async (ctx, next) => {
  await ctx.render(PEER_CONNECTION, {
    title: 'PeerConnection',
  });
})

router.get(`/${LIVE_ROOM}`, async (ctx, next) => {
  await ctx.render(LIVE_ROOM, {});
});

router.get(`/${TRANSPORT_CONTROL_AND_STAT}`, async (ctx, next) => {
  await ctx.render(TRANSPORT_CONTROL_AND_STAT, {});
});

router.get(`/${TEXT_CHAT}`, async (ctx, next) => {
  await ctx.render(TEXT_CHAT);
})

module.exports = router

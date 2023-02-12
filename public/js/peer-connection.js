const localVideoEl = document.getElementById('local-video');
const remoteVideoEl = document.getElementById('remote-video');
const playBtnEl = document.getElementById('play-btn');
const callBtnEl = document.getElementById('call-btn');
const hangupBtnEl = document.getElementById('hangup-btn');
const localSdpEl = document.getElementById('local-sdp');
const remoteSdpEl = document.getElementById('remote-sdp');

/**
 * 本地采集的媒体流
 * @type {MediaStream}
 */
let localStream = null;
/**
 * 本地连接
 * @type {RTCPeerConnection}
 */
let localConnection = null;

/**
 * 远程连接
 * @type {RTCPeerConnection}
 */
let remoteConnection = null;

/**
 * 采集本地的音视频数据，并将媒体流输出到页面
 */
async function handlePlay() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('navigator.mediaDevices.getUserMedia() is not supported!');
  }
  /**
   * @type {MediaStreamConstraints}
   */
  const constraints = {
    video: true,
    // audio: true
  };

  try {
    // 采集音视频数据
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    localStream = stream;
    // 将媒体数据输出到 video 元素
    localVideoEl.srcObject = stream;
  } catch (error) {
    console.error(error);
  }
}

/**
 * 建立端对端连接，并传输媒体数据
 */
async function handleCall() {
  // 创建端对端连接的实例
  localConnection = new RTCPeerConnection();
  remoteConnection = new RTCPeerConnection();

  /**
   * 注意：在进行媒体协商之前，需要先将本地采集的媒体流添加到端对端连接中去。
   * 这样在媒体协商之前，才知道有哪些媒体数据。
   * 如果先做媒体协商的话，此时连接中是没有媒体流数据的，就不会设置相关底层的接收器、发送器。
   * 即使后面再将媒体流添加到连接中，也不会再进行媒体传输。
   * 所以要先添加媒体流，再进行媒体协商。
   */

  // 将本地采集的音视频数据输出到本地连接中
  localStream.getTracks().forEach((track) => {
    localConnection.addTrack(track, localStream);
  });

  // 对端接收媒体数据
  remoteConnection.ontrack = (e) => {
    // 其中会有多个流，只需取一个即可
    remoteVideoEl.srcObject = e.streams[0];
  };

  // 端与端之间进行媒体协商
  try {
    // 本地创建 offer SDP
    const offerSDP = await localConnection.createOffer({
      offerToReceiveAudio: 0, // 不处理音频
      offerToReceiveVideo: 1,
    });

    // 本地设置 offer SDP
    localConnection.setLocalDescription(offerSDP);
    // 对端设置 offer SDP
    remoteConnection.setRemoteDescription(offerSDP);

    // console.log(offerSDP.sdp);
    localSdpEl.textContent += offerSDP.sdp;

    try {
      // 对端创建 answer SDP
      const answerSDP = await remoteConnection.createAnswer();
      // 对端设置 answer SDP
      remoteConnection.setLocalDescription(answerSDP);
      // 本地设置 answer SDP
      localConnection.setRemoteDescription(answerSDP);

      // console.log(answerSDP.sdp);
      remoteSdpEl.textContent += answerSDP.sdp;

      } catch (error) {
      console.error(err);
    }
  } catch (error) {
    console.error(err);
  }

  // 交换候选者
  localConnection.onicecandidate = (e) => {
    remoteConnection.addIceCandidate(e.candidate);
  };
  remoteConnection.onicecandidate = (e) => {
    localConnection.addIceCandidate(e.candidate);
  };

  const setOnlineStatus = (status) => console.log(status);

  // 检测连接状态
  remoteConnection.onconnectionstatechange = (ev) => {
    switch (remoteConnection.connectionState) {
      case 'new':
      case 'checking':
        setOnlineStatus('Connecting…');
        break;
      case 'connected':
        setOnlineStatus('Online');
        break;
      case 'disconnected':
        setOnlineStatus('Disconnecting…');
        break;
      case 'closed':
        setOnlineStatus('Offline');
        break;
      case 'failed':
        setOnlineStatus('Error');
        break;
      default:
        setOnlineStatus('Unknown');
        break;
    }
  };
}

/**
 * 挂断通话，断开端对端连接
 */
function handleHangup() {
  // 断开端对端连接
  localConnection.close();
  remoteConnection.close();

  localConnection = null;
  remoteConnection = null;
  remoteVideoEl.srcObject = null;
}

playBtnEl.addEventListener('click', handlePlay, false);
callBtnEl.addEventListener('click', handleCall, false);
hangupBtnEl.addEventListener('click', handleHangup, false);

import {_supabase} from '../config.js';
import '../widgets.js';
import '../global.js';

let myProfile = null;

window.onload = async () => {
  const {data: {user}} = await _supabase.auth.getUser();
  if (!user) {
    window.location.href = 'auth.html';
    return;
  }

  const {data: profile} = await _supabase.from('profiles').select('*').eq('id', user.id).single();

  if (profile) {
    myProfile = profile;
    window.myProfile = profile;
    window.currentUserId = user.id;

    const nickEl = document.getElementById('displayNick');
    if (nickEl) nickEl.innerText = myProfile.username;

    if (typeof updateFriendNotifications === 'function') updateFriendNotifications();
    if (typeof initGlobalStatus === 'function') initGlobalStatus(_supabase, myProfile);
    if (typeof updateGlobalMsgBadge === 'function') updateGlobalMsgBadge(_supabase, myProfile.id);

    checkAdminReplies();

    _supabase.channel('forum-msg-updates')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'direct_messages',
        filter: `receiver_id=eq.${user.id}`
      }, () => {
        if (typeof updateGlobalMsgBadge === 'function') updateGlobalMsgBadge(_supabase, user.id);
      })
      .subscribe();

    _supabase.channel('support-realtime')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'support_tickets',
        filter: `user_id=eq.${myProfile.id}`
      }, (payload) => {
        checkAdminReplies();
        if (payload.new.status === 'resolved' && !payload.new.is_read) {
          if (typeof playNotificationSound === 'function') playNotificationSound();
        }
      })
      .subscribe();
  }
  loadTopics();
};

async function loadTopics() {
  const {data} = await _supabase.from('forum_topics').select('*').order('created_at', {ascending: false});
  const list = document.getElementById('topicsList');
  if (!list) return;
  list.innerHTML = '';
  if (data) {
    data.forEach(topic => {
      const date = new Date(topic.created_at).toLocaleDateString();
      list.innerHTML += `
        <div class="topic-card" onclick="window.location.href='topic.html?id=${topic.id}'">
          <div class="topic-title">${topic.title}</div>
          <div class="user-text-content" style="margin-bottom: 10px;">${topic.content.substring(0, 120)}${topic.content.length > 120 ? '...' : ''}</div>
          <div style="font-size: 0.8rem; color: #777; font-family: 'Arial', 'Helvetica', sans-serif !important;">
            Autor: <strong style="color: #aaa;">${topic.author_name}</strong> • ${date}
          </div>
        </div>
      `;
    });
  }
}

window.createNewTopic = async () => {
  if (!myProfile) return;
  const title = document.getElementById('topicTitle').value.trim();
  const content = document.getElementById('topicContent').value.trim();
  if (!title || !content) return;
  const {error} = await _supabase.from('forum_topics').insert([{
    title,
    content,
    author_name: myProfile.username,
    author_id: myProfile.id
  }]);
  if (!error) {
    document.getElementById('topicTitle').value = '';
    document.getElementById('topicContent').value = '';
    loadTopics();
  }
};

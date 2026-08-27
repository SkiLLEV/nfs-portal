import { _supabase } from '../config.js';
import '../widgets.js';
import '../global.js';

window.myProfile = null;

function showLoggedIn(profile) {
  const loginBtn = document.getElementById('loginBtn');
  const userInfo = document.getElementById('userInfo');
  const nick = document.getElementById('displayNick');

  if (loginBtn) loginBtn.style.display = 'none';
  if (userInfo) userInfo.style.display = 'flex';
  if (nick) {
    nick.innerText = profile.username;
    if (profile.is_admin) nick.className = 'admin-glow';
  }
}

// ==================== ІНІЦІАЛІЗАЦІЯ СТОРІНКИ ====================
const initPage = async () => {
  if (typeof applyLanguage === 'function') applyLanguage();

  const { data: { user } } = await _supabase.auth.getUser();

  if (user) {
    window.currentUserId = user.id;
    const { data: profile } = await _supabase.from('profiles').select('*').eq('id', user.id).single();
    if (profile) {
      window.myProfile = profile;

      const savedStatus = localStorage.getItem('driver_status') || profile.status || 'ONLINE';
      window.myProfile.status = savedStatus;

      showLoggedIn(profile);

      const notifyWrapper = document.getElementById('notifyWrapper');
      if (notifyWrapper) notifyWrapper.style.display = 'flex';

      if (typeof window.initGlobalStatus === 'function') {
        window.initGlobalStatus(_supabase, window.myProfile);
      }

      if (typeof window.updateGlobalMsgBadge === 'function') window.updateGlobalMsgBadge(_supabase, window.myProfile.id);
      if (typeof window.updateFriendNotifications === 'function') window.updateFriendNotifications();
      if (typeof window.checkAdminReplies === 'function') window.checkAdminReplies();

      // Realtime події для особистих повідомлень
      _supabase.channel('index-realtime')
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'direct_messages',
          filter: `receiver_id=eq.${window.myProfile.id}`
        }, () => {
          if (typeof window.updateGlobalMsgBadge === 'function') window.updateGlobalMsgBadge(_supabase, window.myProfile.id);
          if (typeof window.playNotificationSound === 'function') window.playNotificationSound();
        })
        .subscribe();

      // Realtime події для тикетів підтримки
      _supabase.channel('support-realtime')
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'support_tickets',
          filter: `user_id=eq.${window.myProfile.id}`
        }, (payload) => {
          if (typeof window.checkAdminReplies === 'function') window.checkAdminReplies();
          if (payload.new.status === 'resolved' && !payload.new.is_read) {
            if (typeof window.playNotificationSound === 'function') window.playNotificationSound();
          }
        })
        .subscribe();
    }
  } else {
    if (typeof window.initGlobalStatus === 'function') {
      window.initGlobalStatus(_supabase, null);
    }
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPage);
} else {
  initPage();
}

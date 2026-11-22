(() => {
  'use strict';

  function comparable(value) {
    if (Array.isArray(value)) return value.map(comparable);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.keys(value).sort().map(key => [key, comparable(value[key])]));
    }
    return value;
  }

  const same = (left, right) => JSON.stringify(comparable(left)) === JSON.stringify(comparable(right));
  const eventMap = doc => new Map((doc?.events ?? []).map(event => [event.id, event]));

  function merge(base, local, remote, preference) {
    const conflicts = [];
    function resolve(key, prior, mine, theirs) {
      if (same(mine, theirs) || same(theirs, prior)) return mine;
      if (same(mine, prior)) return theirs;
      conflicts.push(key);
      return preference === 'remote' ? theirs : mine;
    }

    const before = eventMap(base), onDevice = eventMap(local), onServer = eventMap(remote);
    const ids = new Set([...onDevice.keys(), ...onServer.keys()]);
    const events = [];
    for (const id of ids) {
      const event = resolve(id, before.get(id), onDevice.get(id), onServer.get(id));
      if (event) events.push(event);
    }
    return {
      data: {
        events,
        wakeSchedule: resolve('Расписание пробуждения', base?.wakeSchedule, local.wakeSchedule, remote.wakeSchedule)
      },
      conflicts
    };
  }

  function start({ read, readMeta, apply, validate, isEditing, isPristine }) {
    const config = window.PHAZE_SYNC_CONFIG;
    const get = id => document.getElementById(id);
    const message = get('syncMessage');
    const conflictPanel = get('syncConflict');
    let client, clientPromise, working = false, conflict = null, statusVersion = 0;
    const setStatus = text => { message.textContent = text; };

    const configured = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(config?.url ?? '')
      && /^sb_publishable_[\w-]+$/.test(config?.publishableKey ?? '');
    if (!configured) return;
    get('syncControls').hidden = false;
    setStatus('Войди, чтобы включить синхронизацию своих событий и расписания пробуждения.');

    async function connect() {
      clientPromise ??= import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.89.0/+esm')
        .then(({ createClient }) => {
          client = createClient(config.url, config.publishableKey, {
            auth: { storageKey: 'studio1037-phaze-auth', detectSessionInUrl: false }
          });
          return client;
        })
        .catch(error => { clientPromise = null; throw error; });
      return clientPromise;
    }

    async function sync(preference) {
      if (working || !navigator.onLine || isEditing()) return;
      working = true;
      const operation = ++statusVersion;
      try {
        const api = await connect();
        const { data, error } = await api.auth.getSession();
        if (error) throw error;
        const user = data.session?.user.id;
        const meta = readMeta();
        if (!meta?.enabled) return;
        if (!user) {
          setStatus('Сессия истекла. Войди снова. Локальные изменения сохранены.');
          return;
        }
        if (meta.owner !== user) {
          setStatus('Локальные данные привязаны к другому аккаунту. Войди в исходный аккаунт для синхронизации.');
          return;
        }
        for (let attempt = 0; attempt < 3; attempt++) {
          const local = read();
          const { data: row, error: readError } = await api.from('phaze_plans')
            .select('revision,payload').eq('owner', user).maybeSingle();
          if (readError) throw readError;
          if (row && !validate(row.payload)) throw Error('Облачная копия имеет неподдерживаемый формат.');
          if (!row && meta.base) throw Error('Облачная копия исчезла. Локальные данные сохранены.');
          const selected = conflict && row?.revision === conflict.revision && same(local, conflict.local)
            ? preference : undefined;
          const result = row && (meta.base || !isPristine())
            ? merge(meta.base, local, row.payload, selected)
            : { data: row?.payload ?? local, conflicts: [] };
          if (!validate(result.data)) throw Error('Объединённая копия превышает допустимый размер или имеет неверный формат.');
          if (operation !== statusVersion || isEditing()) return;
          if (!same(local, read())) continue;
          if (result.conflicts.length && !selected) {
            conflict = { revision: row.revision, local, remote: row.payload };
            conflictPanel.hidden = false;
            setStatus(`Конфликтов: ${result.conflicts.length}. Выбери версию для конфликтующих записей. Остальные изменения объединятся.`);
            return;
          }
          if (!row) {
            const { error: insertError } = await api.from('phaze_plans').insert({
              owner: user, revision: 1, payload: result.data
            });
            if (insertError?.code === '23505') continue;
            if (insertError) throw insertError;
          } else if (!same(row.payload, result.data)) {
            const { data: updated, error: updateError } = await api.from('phaze_plans')
              .update({ revision: row.revision + 1, payload: result.data })
              .eq('owner', user).eq('revision', row.revision).select('revision').maybeSingle();
            if (updateError) throw updateError;
            if (!updated) continue;
          }
          if (operation !== statusVersion || !readMeta()?.enabled || isEditing()) return;
          if (!same(local, read())) {
            setStatus('Новые локальные изменения сохранены. Синхронизация повторится автоматически.');
            return;
          }
          apply(result.data, { owner: user, enabled: true, base: result.data });
          conflict = null;
          conflictPanel.hidden = true;
          setStatus('Синхронизировано · ' + new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }));
          return;
        }
        setStatus('Данные изменились во время синхронизации. Попробую снова автоматически.');
      } catch (error) {
        if (operation === statusVersion) setStatus('Синхронизация приостановлена. Локальная копия сохранена. ' + error.message);
      } finally {
        working = false;
      }
    }

    async function authAction(action) {
      try { await action(await connect()); }
      catch (error) { setStatus(error.message); }
    }

    get('syncSendCode').onclick = () => authAction(async api => {
      const email = get('syncEmail');
      if (!email.reportValidity()) return;
      const { error } = await api.auth.signInWithOtp({ email: email.value.trim() });
      if (error) throw error;
      setStatus('Введи код из письма Supabase.');
    });

    get('syncSignIn').onclick = () => authAction(async api => {
      const email = get('syncEmail'), code = get('syncCode');
      if (!email.reportValidity() || !code.reportValidity()) return;
      const { data, error } = await api.auth.verifyOtp({ email: email.value.trim(), token: code.value.trim(), type: 'email' });
      if (error) throw error;
      const owner = data.user?.id, meta = readMeta();
      if (!owner) throw Error('Вход не завершён.');
      if (meta?.owner && meta.owner !== owner) {
        await api.auth.signOut({ scope: 'local' });
        throw Error('На этом устройстве обнаружены данные другого аккаунта.');
      }
      apply(read(), { owner, enabled: true, base: meta?.base ?? null });
      code.value = '';
      await sync();
    });

    get('syncSignOut').onclick = () => authAction(async api => {
      statusVersion++;
      const meta = readMeta();
      if (meta) apply(read(), { ...meta, enabled: false });
      conflict = null;
      conflictPanel.hidden = true;
      const { error } = await api.auth.signOut({ scope: 'local' });
      if (error) throw error;
      setStatus('Синхронизация отключена. Локальные данные доступны.');
    });
    get('syncNow').onclick = () => readMeta()?.enabled ? sync() : setStatus('Сначала войди в аккаунт синхронизации.');
    get('syncKeepLocal').onclick = () => sync('local');
    get('syncKeepRemote').onclick = () => sync('remote');
    get('syncExportConflict').onclick = () => {
      if (!conflict) return;
      const url = URL.createObjectURL(new Blob([JSON.stringify(conflict, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'phaze-sync-conflict.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    const resume = () => { if (readMeta()?.enabled) sync(); };
    window.addEventListener('online', resume);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) resume(); });
    setInterval(() => { if (!document.hidden) resume(); }, 30000);
    if (readMeta()?.enabled) {
      setStatus(navigator.onLine ? 'Проверяю подключение…' : 'Нет сети. Изменения хранятся на устройстве.');
      resume();
    }
  }

  window.PHAZESync = { start };
})();

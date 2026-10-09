(function (global, document) {
    'use strict';

    if (global.__sgiLogoutHandlerInstalled) return;
    global.__sgiLogoutHandlerInstalled = true;

    const destinoDeLogin = () => {
        const base = String(global.SGI_BASE_PATH || '').replace(/\/+$/, '');
        return `${base}/login` || '/login';
    };

    const informarFalha = async () => {
        if (global.SGI && typeof global.SGI.alert === 'function') {
            await global.SGI.alert({
                titulo: 'Não foi possível sair',
                mensagem: 'A sessão continua ativa. Verifique sua conexão e tente novamente.',
                tipo: 'error'
            });
        } else if (global.console && typeof global.console.error === 'function') {
            global.console.error('Logout não confirmado: o manipulador de confirmação não está disponível.');
        }
    };

    document.addEventListener('click', async event => {
        const link = event.target?.closest?.('[data-sgi-logout]');
        if (!link || event.defaultPrevented) return;
        event.preventDefault();
        if (link.dataset.sgiLogoutPending === '1') return;
        link.dataset.sgiLogoutPending = '1';

        try {
            if (!global.SGI || typeof global.SGI.confirm !== 'function') {
                throw new Error('A confirmação de saída não está disponível.');
            }
            const autorizado = await global.SGI.confirm({
                titulo: 'Sair do SGI?',
                mensagem: 'Sua sessão será encerrada neste dispositivo.',
                textoConfirmar: 'Sair'
            });
            if (!autorizado) return;

            const resposta = await global.fetch(link.href, {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'X-SGI-CSRF': global.SGI_CSRF_TOKEN || '' }
            });
            const destino = new URL(resposta.url);
            const loginEsperado = new URL(destinoDeLogin(), global.location.origin);
            if (!resposta.ok
                || !resposta.redirected
                || destino.origin !== global.location.origin
                || destino.pathname !== loginEsperado.pathname) {
                throw new Error('O servidor não confirmou o encerramento da sessão.');
            }

            global.location.assign(destino.href);
        } catch (error) {
            if (global.console && typeof global.console.error === 'function') {
                global.console.error('Falha ao encerrar sessão:', error);
            }
            delete link.dataset.sgiLogoutPending;
            await informarFalha();
        } finally {
            if (link.isConnected) delete link.dataset.sgiLogoutPending;
        }
    }, true);
}(window, document));

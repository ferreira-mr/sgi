(function (global) {
    'use strict';
    if (global.SGIPage) return;
    var activeScope = null;
    var constructionScope = null;

    function visible(element) {
        if (!element) return false;
        var style = global.getComputedStyle ? global.getComputedStyle(element) : null;
        if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
        return typeof element.getClientRects !== 'function' || element.getClientRects().length > 0;
    }

    function releaseContentTarget(element) {
        if (!element) return;
        if (element.dataset.sgiSkipTargetIdAssigned === '1' && element.id === 'sgi-main-content') {
            element.removeAttribute('id');
        }
        if (element.dataset.sgiSkipTargetTabindexAssigned === '1' && element.getAttribute('tabindex') === '-1') {
            element.removeAttribute('tabindex');
        }
        delete element.dataset.sgiSkipTarget;
        delete element.dataset.sgiSkipTargetIdAssigned;
        delete element.dataset.sgiSkipTargetTabindexAssigned;
    }

    function updateContentTarget(root) {
        root = root || document;
        var mains = [];
        if (root.matches && root.matches('main')) mains.push(root);
        if (root.querySelectorAll) mains = mains.concat(Array.prototype.slice.call(root.querySelectorAll('main')));
        var target = mains.find(visible) || null;
        if (!target) return null;

        var previous = document.querySelector('[data-sgi-skip-target="1"]');
        if (previous && previous !== target) releaseContentTarget(previous);

        if (!target.id) {
            target.id = 'sgi-main-content';
            target.dataset.sgiSkipTargetIdAssigned = '1';
        }
        if (!target.hasAttribute('tabindex')) {
            target.setAttribute('tabindex', '-1');
            target.dataset.sgiSkipTargetTabindexAssigned = '1';
        }
        target.dataset.sgiSkipTarget = '1';

        var link = document.querySelector('.sgi-skip-link');
        if (link) link.setAttribute('href', '#' + target.id);
        return target;
    }

    function focusPageHeading(root) {
        root = root || document;
        var heading = null;
        ['h1', 'h2', '[role="heading"][aria-level="1"], [role="heading"][aria-level="2"]', '[data-sgi-page-heading]'].some(function (selector) {
            var headings = [];
            if (root.matches && root.matches(selector)) headings.push(root);
            if (root.querySelectorAll) headings = headings.concat(Array.prototype.slice.call(root.querySelectorAll(selector)));
            heading = headings.find(visible) || null;
            return heading !== null;
        });
        heading = heading || updateContentTarget(root) || null;
        if (!heading || typeof heading.focus !== 'function') return null;
        if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
        try {
            heading.focus({ preventScroll: true });
        } catch (_) {
            heading.focus();
        }
        return heading;
    }

    function scheduleContentTargetUpdate() {
        if (document.readyState === 'loading' && document.addEventListener) {
            document.addEventListener('DOMContentLoaded', function () { updateContentTarget(document); }, { once: true });
        } else {
            updateContentTarget(document);
        }
        if (global.addEventListener) {
            global.addEventListener('resize', function () { updateContentTarget(document); }, { passive: true });
        }
    }

    scheduleContentTargetUpdate();

    function installMesarioRefreshGuard() {
        if (Number(global.SGI_SESSION_NIVEL) !== 2 || !document.addEventListener) return;
        var noticeVisible = false;
        document.addEventListener('keydown', function (event) {
            var isRefreshShortcut = event.key === 'F5'
                || ((event.ctrlKey || event.metaKey) && String(event.key).toLowerCase() === 'r');
            if (!isRefreshShortcut) return;
            event.preventDefault();
            event.stopPropagation();
            if (noticeVisible) return;
            noticeVisible = true;
            if (global.SGI && typeof global.SGI.showToast === 'function') {
                global.SGI.showToast('Ops, mesário! Para manter o placar seguro, não atualize esta página. Continue por aqui 💙', 'info', { delay: 5000 });
            }
            global.setTimeout(function () { noticeVisible = false; }, 5000);
        }, true);
    }

    installMesarioRefreshGuard();

    function createScope() {
        var listeners = new WeakMap();
        var globalListeners = [];
        var cleanups = [];
        var registrationBatch = 0;
        var scope = {
            active: true,
            beginBatch: function () { registrationBatch += 1; },
            listen: function (target, type, callback, options) {
                // Some controls only exist for a particular profile or layout.
                if (target == null) return;
                var records = listeners.get(target) || new Map();
                listeners.set(target, records);
                var capture = typeof options === 'boolean' ? options : !!(options && options.capture);
                // A function's source text is not its identity: two closures can
                // have the same source and still capture different state. Keep
                // one binding per callback/options pair while allowing both
                // legitimate handlers to coexist.
                var key = type + ':' + capture;
                var callbacks = records.get(key) || [];
                var obsolete = callbacks.filter(function (record) { return record.batch < registrationBatch; });
                obsolete.forEach(function (record) {
                    target.removeEventListener(type, record.callback, record.options);
                    var globalIndex = globalListeners.indexOf(record);
                    if (globalIndex >= 0) globalListeners.splice(globalIndex, 1);
                });
                callbacks = callbacks.filter(function (record) { return record.batch >= registrationBatch; });
                var previous = callbacks.find(function (record) {
                    return record.callback === callback && record.options === options;
                });
                if (previous) {
                    target.removeEventListener(type, previous.callback, previous.options);
                    callbacks = callbacks.filter(function (record) { return record !== previous; });
                }
                var record = { target: target, type: type, callback: callback, options: options, batch: registrationBatch };
                callbacks.push(record);
                records.set(key, callbacks);
                if (target === global || target === document) {
                    var index = globalListeners.indexOf(previous);
                    if (index >= 0) {
                        globalListeners[index] = record;
                    } else {
                        globalListeners.push(record);
                    }
                }
                target.addEventListener(type, callback, options);
            },
            onDeactivate: function (callback) { cleanups.push(callback); },
            activate: function () {
                scope.active = true;
                globalListeners.forEach(function (r) { r.target.addEventListener(r.type, r.callback, r.options); });
                activeScope = scope;
            },
            deactivate: function () {
                scope.active = false;
                globalListeners.forEach(function (r) { r.target.removeEventListener(r.type, r.callback, r.options); });
                cleanups.forEach(function (callback) { callback(); });
                if (global.SGI && typeof global.SGI.cancelDialogs === 'function') global.SGI.cancelDialogs();
            }
        };
        return scope;
    }
    function ready(callback, explicitScope) {
        var scope = explicitScope || constructionScope;
        var invoke = function () {
            if (scope) scope.beginBatch();
            callback();
        };
        if (global.__SGI_SPA__ && global.__SGI_SPA__.registrarInit) {
            global.__SGI_SPA__.registrarInit(invoke);
        } else if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', invoke, { once: true });
        } else {
            invoke();
        }
    }
    function mount(name, factory) {
        var element = document.querySelector('script[data-sgi-config="' + name + '"]');
        var config = element ? JSON.parse(element.textContent) : {};
        var actions = {};
        var scope = createScope();
        ready(function () { scope.activate(); Object.assign(global, actions); }, null);
        constructionScope = scope;
        actions = factory(config, scope) || {};
        constructionScope = null;
        // Atributos de eventos HTML continuam disponíveis enquanto o estado de
        // cada tela permanece isolado em seu próprio closure.
        Object.assign(global, actions);
    }
    function prepareModal(element) {
        if (!element || element.dataset.sgiModalLifecycle === '1') return;
        element.dataset.sgiModalLifecycle = '1';
        var opening = false;
        var closeRequested = false;
        element.addEventListener('show.bs.modal', function () { opening = true; });
        element.addEventListener('shown.bs.modal', function () {
            opening = false;
            if (closeRequested) {
                closeRequested = false;
                global.bootstrap.Modal.getOrCreateInstance(element).hide();
            }
        });
        element.addEventListener('click', function (event) {
            if (opening && event.target.closest('[data-bs-dismiss="modal"]')) {
                closeRequested = true;
            }
        });
    }
    global.SGIPage = {
        ready: ready, mount: mount, prepareModal: prepareModal,
        updateContentTarget: updateContentTarget,
        installMesarioRefreshGuard: installMesarioRefreshGuard,
        focusPageHeading: focusPageHeading,
        deactivate: function () { if (activeScope) activeScope.deactivate(); activeScope = null; }
    };
})(window);

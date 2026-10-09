const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('resources/js/shared/page-runtime.js', 'utf8');

test('optional elements do not interrupt registration of the remaining screen actions', () => {
    const window = {};
    const document = { readyState: 'complete', querySelector: () => null };
    const button = new EventTarget();
    let calls = 0;
    vm.runInNewContext(source, { window, document });
    window.SGIPage.mount('profile', (_, scope) => {
        scope.listen(null, 'click', () => {});
        scope.listen(undefined, 'click', () => {});
        scope.listen(button, 'click', () => calls++);
    });
    button.dispatchEvent(new Event('click'));
    assert.equal(calls, 1);
});

test('different closures with the same source both receive their event', () => {
    const window = {};
    const document = { readyState: 'complete', querySelector: () => null };
    const target = new EventTarget();
    const calls = [];
    vm.runInNewContext(source, { window, document });
    window.SGIPage.mount('same-source', (_, scope) => {
        const createHandler = value => () => calls.push(value);
        scope.listen(target, 'click', createHandler('first'));
        scope.listen(target, 'click', createHandler('second'));
    });
    target.dispatchEvent(new Event('click'));
    assert.deepEqual(calls, ['first', 'second']);
});

test('screen actions retain isolated state and are restored on reactivation', () => {
    const inits = [];
    const window = { __SGI_SPA__: { registrarInit: fn => inits.push(fn) } };
    const document = { querySelector: () => ({ textContent: '{"start":3}' }) };
    vm.runInNewContext(source, { window, document });
    window.SGIPage.mount('first', config => { let count = config.start; return { increment: () => ++count }; });
    assert.equal(window.increment(), 4);
    window.SGIPage.mount('second', () => ({ increment: () => 99 }));
    assert.equal(window.increment(), 99);
    inits[0]();
    assert.equal(window.increment(), 5);
});

test('closing during modal opening waits for the Bootstrap transition', () => {
    const listeners = {};
    let hidden = 0;
    const element = { dataset: {}, addEventListener: (name, fn) => listeners[name] = fn };
    const window = { bootstrap: { Modal: { getOrCreateInstance: () => ({ hide: () => hidden++ }) } } };
    vm.runInNewContext(source, { window, document: {} });
    window.SGIPage.prepareModal(element);
    listeners['show.bs.modal']();
    listeners.click({ target: { closest: () => true } });
    assert.equal(hidden, 0);
    listeners['shown.bs.modal']();
    assert.equal(hidden, 1);
});

test('reactivating a screen neither duplicates handlers nor keeps global events active while hidden', () => {
    const inits = [];
    const events = new Map();
    const target = {
        addEventListener: (type, callback) => { const set = events.get(type) || new Set(); set.add(callback); events.set(type, set); },
        removeEventListener: (type, callback) => events.get(type)?.delete(callback),
    };
    const window = { ...target, __SGI_SPA__: { registrarInit: fn => inits.push(fn) } };
    const document = { querySelector: () => null };
    vm.runInNewContext(source, { window, document });
    let clicks = 0;
    window.SGIPage.mount('agenda', (_, scope) => {
        window.SGIPage.ready(() => scope.listen(window, 'click', () => clicks++));
    });
    for (let i = 0; i < 3; i++) inits.forEach(fn => fn());
    events.get('click').forEach(fn => fn());
    assert.equal(clicks, 1);
    window.SGIPage.deactivate();
    assert.equal(events.get('click').size, 0);
    inits.forEach(fn => fn());
    events.get('click').forEach(fn => fn());
    assert.equal(clicks, 2);
});

test('mesário recebe aviso amigável ao tentar atualizar com atalho do teclado', () => {
    const events = new Map();
    const document = {
        readyState: 'complete',
        querySelector: () => null,
        addEventListener: (type, callback) => events.set(type, callback),
    };
    const notices = [];
    const window = {
        SGI_SESSION_NIVEL: 2,
        SGI: { showToast: (...args) => notices.push(args) },
        setTimeout: callback => callback(),
    };
    vm.runInNewContext(source, { window, document });

    let prevented = false;
    let stopped = false;
    events.get('keydown')({ key: 'F5', preventDefault: () => { prevented = true; }, stopPropagation: () => { stopped = true; } });

    assert.equal(prevented, true);
    assert.equal(stopped, true);
    assert.equal(notices[0][1], 'info');
    assert.equal(notices[0][2].delay, 5000);
    assert.match(notices[0][0], /não atualize esta página/i);
});

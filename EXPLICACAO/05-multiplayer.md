# 05 — Multiplayer e Sincronização de Animações

## Visão Geral

O multiplayer utiliza Socket.IO (server `server.js` + client `network.js`) para conectar múltiplos jogadores. A máquina de estados de animação é parte dos dados sincronizados entre clientes.

## Como o Estado de Animação é Enviado

Em `game.js:932-954`, dentro de `updateGame()`:

```javascript
// Throttle a 20Hz (a cada 50ms)
const payload = {
    x: model.position.x,
    y: model.position.y,
    z: model.position.z,
    rotY: model.rotation.y,
    anim: currentAnimationState || 'idle'  // ← ESTADO DA ANIMAÇÃO
};
// Envio best-effort (volatile) para menor latência
if (window.network.sendUpdateVolatile)
    window.network.sendUpdateVolatile(payload);
else
    window.network.sendUpdate(payload);
```

O estado `currentAnimationState` (string como `'idle'`, `'walk'`, `'run'`, etc.) é incluído no pacote de update e enviado para o servidor, que o retransmite para os outros jogadores na mesma sala.

## Como o Estado é Recebido

Em `main.js:663-681`, a função `updateRemotePlayer()` processa os dados recebidos:

```javascript
function updateRemotePlayer(player) {
    const mesh = remotePlayers.get(player.id);
    if (mesh) {
        // Calcula velocidade para predição
        const newPos = new THREE.Vector3(player.x, player.y, player.z);
        mesh.userData.velocity = newPos.clone().sub(lastPos).divideScalar(dt);
        mesh.userData.target.copy(newPos);
        mesh.userData.targetRotY = player.rotY;
        // O estado anim NÃO é aplicado ao jogador remoto!
        // (apenas posição e rotação são interpoladas)
    }
}
```

**Limitação atual:** O campo `anim` é enviado mas **não é utilizado** na recepção. Os jogadores remotos são representados por **caixas coloridas** (`BoxGeometry`) sem animação de esqueleto. A sincronização de animação entre clientes não está implementada.

## Interpolação de Jogadores Remotos (main.js:587-605)

```javascript
window.network.remotePlayers.forEach((mesh, id) => {
    // Predição de posição baseada em latência (até 300ms)
    const predictFactor = Math.min(latency + 0.06, 0.3);
    const predicted = lastPos.clone().add(velocity.clone().multiplyScalar(predictFactor));
    
    // Suavização via lerp (fator 0.2)
    mesh.position.lerp(predicted, 0.2);
    
    // Suavização de rotação
    mesh.rotation.y += (targetRotY - mesh.rotation.y) * 0.2;
});
```

## O Que Falta Para Sincronizar Animações no Multiplayer

Para que a máquina de estados funcione totalmente no multiplayer, seria necessário:

1. **Carregar o modelo completo** (não placeholder) para jogadores remotos
2. **Criar um AnimationMixer** para cada jogador remoto
3. **Aplicar o estado `anim` recebido** no mixer do jogador remoto
4. **Sincronizar o tempo** da animação (especialmente para `LoopOnce` como `shooting`)

## Arquitetura de Rede

```
Cliente A                    Servidor                    Cliente B
    │                           │                           │
    ├─ sendSpawn() ───────────► │ ──► broadcast spawn ────► │
    │                           │                           │
    ├─ sendUpdate() ──────────► │ ──► broadcast update ───► │
    │   (pos + rotY + anim)    │    (para outros clients)   │
    │                           │                           │
    ├─ sendAction(shoot) ─────► │ ──► broadcast action ───► │
    │                           │                           │
    ◄──── broadcast update ────┤ ◄─── sendUpdate() ────────┤
    │   (pos + rotY + anim)    │    de Cliente B para      │
    │                           │    outros clients         │
```

## Eventos de Ação com Animação

Além do update periódico, ações específicas disparam eventos de rede:

```javascript
// Tiro (game.js:580-590)
window.network.sendAction({
    type: 'shoot',
    x, y, z,
    dirX, dirY, dirZ
});

// Pulo (game.js:806-813)
window.network.sendAction({
    type: 'jump',
    x, y, z
});

// Coleta (game.js:917-924)
window.network.sendAction({
    type: 'collect',
    x, y, z
});
```

Estes eventos permitiriam (com implementação futura) disparar animações `shooting` e `upjump` nos jogadores remotos ao receber a ação.

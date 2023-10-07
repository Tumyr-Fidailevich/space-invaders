
// проверяем, доступно ли локальное хранилище
//Стандартный синтаксис try - catch
var ls_enabled = false;
try {
    localStorage.setItem("ls-test", true);
    localStorage.getItem("ls-test");
    localStorage.removeItem("ls-test");
    ls_enabled = true;
} catch(error) {
    console.info("LS", error);
}
// создаем холст
var canvas = document.createElement("canvas");
canvas.width = 500;
canvas.height = 500;

// добавляем холст на страницу
document.getElementById("game").appendChild(canvas);

// создаем графический контекст
var ctx = canvas.getContext("2d");

// настройка шрифта
var fontSize = 18;
ctx.font = fontSize + "px Courier New";

// пресеты лейблов
var labelPauseText = "Game Paused (press Enter to continue)";
var labelPause = ctx.measureText(labelPauseText);
var labelWinText = "Invaders defeated (press F5 to play again)";
var labelWin = ctx.measureText(labelWinText);
var labelEndText = "You lose (press F5 to play again)";
var labelEnd = ctx.measureText(labelEndText);

// переменные для игрового цикла
var lastTime = Date.now();
var totalTime = 0;
var elapsed = 0;

// отступ (используется в отрисовке интерфейса и тд)
var padding = 16;

// текстура (тайлсет) для игры
var img = new Image();

// класс Пуля
// hostile(флаг) -- является ли вражеской пулей (влияет на цвет и направление полета)
//dir -- скаляр для разделение на свои и вражеские пули, если
//hostile - true, то - враг, его пули летят вниз,
//если false - это игрок и его пули летят вверх
function Bullet(hostile, x, y) {

    this.w = 5;
    this.h = 8;
    this.x = x;
    this.y = y;

    this.speed = 5;
    if(hostile){
      this.dir = 1;
      this.color = 'white';
    } else {
      this.dir = -1;
      this.color = '#00fc00';
    }
    this.hostile = hostile;
}

Bullet.prototype = {
  update: function(dt){
    this.y += this.speed * this.dir;
  },
  render: function(ctx){
    ctx.fillStyle = this.color;
    ctx.fillRect(this.x, this.y, this.w, this.h);
  }
}

// класс Блок
function Block(x, y) {

    this.w = 44;
    this.h = 32;
    this.x = x;
    this.y = y;

    //Спрайты
    this.tw = 44;
    this.th = 32;
    this.tx = 0;
    this.ty = 48;

    this.health = 4;
}

Block.prototype = {
  render: function(ctx){
    ctx.drawImage(img, this.tx, this.ty, this.tw, this.th, this.x, this.y, this.w, this.h);
  },
  handleDamage: function(){
    this.health--;
    this.ty += this.th;
  }
}

// класс Космического захватчика (противника)
// tier -- уровень (тип) врага
// x, y -- координаты
// row, col -- индексы в построении
function Invader(tier, x, y, row, col) {

    this.tier = tier;

    this.w = 26;
    this.h = 16;
    this.x = x;
    this.y = y;

    //Спрайты
    this.tw = 26;
    this.th = 16;
    this.tx = this.tw * tier;
    this.ty = 0;

    this.row = row;
    this.col = col;
    this.leading = false;

    this.move = 0;
    this.speed = 1;
}

Invader.prototype = {
  render: function(ctx){
    ctx.drawImage(img, this.tx, this.ty, this.tw, this.th, this.x, this.y, this.w, this.h);
  }
}

// класс Игрок (комический корабль игрока)
function Player() {

    this.w = 26;
    this.h = 16;
    this.x = (canvas.width - this.w) / 2;
    this.y = canvas.height - padding * 3 - this.h;

    //Спрайты
    this.tw = 26;
    this.th = 16;
    this.tx = 277;
    this.ty = 228;

    // управление передвижением
    this.moveLeft = false;
    this.moveRight = false;
    this.speed = 5;

    // стрельба
    this.shoot = false;
    this.shootFired = 0;
    this.shootDelay = 1.0;

    // для анимации ранения
    this.respawned = true;
    this.visible = true;
    this.flickElapsed = 0.0;
    this.flickTime = 0.0;
}

Player.prototype = {
  update: function(dt){
    // управление передвижением
    if (this.moveLeft) {
        this.x = Math.max(this.x - this.speed, padding);
    }

    if (this.moveRight) {
        this.x = Math.min(this.x + this.speed, canvas.width - this.w - padding);
    }

    // для анимации ранения
    if (this.respawned) {

        this.flickTime += dt;
        this.flickElapsed += dt;

        if (this.flickTime > 2.0) {
            this.respawned = false;
            this.visible = true;
        }

        if (this.flickElapsed > 0.1) {
            this.visible = !this.visible;
            this.flickElapsed = 0.0;
        }
    }
  },
  render: function(ctx){
    if (this.visible) {
        ctx.drawImage(img, this.tx, this.ty, this.tw, this.th, this.x, this.y, this.w, this.h);
    }
  }
}

var player = new Player();
var bullets = [];
var blocks = [];
var invaders = [];
var invader_index = 0;
var invader_dir = 1;
var invader_speed = 5;
var invader_it = 0.02;
var gameStatePause = 2;
var gameStateWin = 3;
var gameStateEnd = 4;
var gameStatePlaying = 5;
var gameState = gameStatePause;
var started = false;
var score = 0;
if(ls_enabled && parseInt(localStorage.getItem("ls-highscore")) || false){
    highscore = parseInt(localStorage.getItem("ls-highscore"));
} else{
    highscore = 0;
}
var life = 3;


// вызывается когда игра закончена
function game_finished() {
    bullets = [];
    player.visible = true;
    update_highscore();
}

// пересчет топа
function update_highscore() {
    if (highscore < score) {
        highscore = score;
        if (ls_enabled) {
            localStorage.setItem("ls-highscore", highscore);
        }
    }
}

// проверяем, какой противник является стрелком
//leading - стреляющий
// вызывается при запуске игры и при смерти противника
function update_leading_invaders() {
    let dict = {};
    for (let i = 0; i < invaders.length; ++i) {
        let invader = invaders[i];
        if (dict.hasOwnProperty(invader.col)) {//Если имеет данное свойство
            let e = dict[invader.col];
            if (e.row < invader.row) {
                e.row = invader.row;
                e.i = i;
            }
        } else {
            dict[invader.col] = {};
            dict[invader.col].row = invader.row;
            dict[invader.col].i = i;// Получили линию и номер
        }
    }
    console.log(dict);//Dict - словарь объектов
    for (let key in dict) {
        let e = dict[key];
        invaders[e.i].leading = true;//Результат работы всей функции
    }
}

document.onkeydown = function(e) {

    if (e.key == "ArrowLeft") {
        player.moveLeft = true;
    } else if (e.key == "ArrowRight") {
        player.moveRight = true;
    } else if (e.key == " ") {

        if (!started) {
            gameState = gameStatePlaying;
            started = true;
        }

        player.shoot = true;
    } 
}

document.onkeyup = function(e) {

    if (e.key == "ArrowLeft") {
        player.moveLeft = false;
    } else if (e.key == "ArrowRight") {
        player.moveRight = false;
    } else if (e.key == " ") {
        player.shoot = false;
    } else if (e.key == "Enter") {

        started = true;

        if (gameState == gameStatePause) {
            gameState = gameStatePlaying;
        } else if (gameState == gameStatePlaying) {
            gameState = gameStatePause;
        }
    }
}

// функция проверки пересечения двух прямоугольников (для столкновения с пулей)
function intersects(x1, y1, w1, h1, x2, y2, w2, h2) {
    //Для 1 объекта
    let r1MinX = Math.min(x1, x1 + w1);
    let r1MaxX = Math.max(x1, x1 + w1);
    let r1MinY = Math.min(y1, y1 + h1);
    let r1MaxY = Math.max(y1, y1 + h1);
    //Для 2 объекта
    let r2MinX = Math.min(x2, x2 + w2);
    let r2MaxX = Math.max(x2, x2 + w2);
    let r2MinY = Math.min(y2, y2 + h2);
    let r2MaxY = Math.max(y2, y2 + h2);

    let interLeft   = Math.max(r1MinX, r2MinX);
    let interTop    = Math.max(r1MinY, r2MinY);
    let interRight  = Math.min(r1MaxX, r2MaxX);
    let interBottom = Math.min(r1MaxY, r2MaxY);

    return (interLeft < interRight) && (interTop < interBottom);//true - столкновение
}

// вызов сл. кадра
var requestAnimFrame = (function() {
    return window.requestAnimationFrame ||
        window.webkitRequestAnimationFrame ||
        window.mozRequestAnimationFrame ||
        window.oRequestAnimationFrame ||
        window.msRequestAnimationFrame ||
        function(callback) {
            window.setTimeout(callback, 1000 / 60);
        };
})();

// главный цикл игры
function update(dt) {

    // если игра не начата
    if (!started || gameState != gameStatePlaying) return;

    // обновляем игрока и контролируем управление
    player.update(dt);
    if (player.shoot && player.shootDelay < totalTime - player.shootFired) {
        bullets.push(new Bullet(false, player.x + player.w / 2, player.y));
        player.shootFired = totalTime;
        let audio = new Audio("shoot.wav");
        audio.volume = 0.02;
        audio.play();
    }

    // проверяем пули на столкновение и обновляем движение
    for (let i = 0; i < bullets.length; ++i) {

        let bullet = bullets[i];
        bullet.update(dt);

        // если пуля вражеская
        if (bullet.hostile) {

            // если игрок уязвим (не был только что ранен) и ранен
            // наносим урон и удаляем пулю
            if (!player.respawned && intersects(player.x, player.y, player.w, player.h, bullet.x, bullet.y, bullet.w, bullet.h)) {

                player.respawned = true;
                player.flickTime = 0.0;
                player.flickElapsed = 0.0;
                player.visible = false;
                life -= 1;
                // кончились жизни
                if (life == 0) {
                    gameState = gameStateEnd;
                    game_finished();
                }

                bullets.splice(i, 1);
                break;
            } else if (bullet.y > player.y + player.h) { // пуля улетела за игрока
                bullets.splice(i, 1);
                break;
            } else { // проверяем попадание в укрепление

                // ищем попадание
                let inter = -1;
                for (let j = 0; j < blocks.length; ++j) {
                    let block = blocks[j];
                    if (intersects(block.x, block.y, block.w, block.h, bullet.x, bullet.y, bullet.w, bullet.h)) {
                        inter = j;
                        break;
                    }
                }

                // если попала, наносим блоку ранение и удаляем пулю
                if (inter >= 0) {
                    bullets.splice(i, 1);
                    blocks[inter].handleDamage();
                    if (blocks[inter].health == 0) {
                        blocks.splice(inter, 1);
                    }
                    break;
                }
            }
        } else {  // это пуля игрока, проверяем попала ли в цель

            // ищем попадание
            let inter = -1;
            for (let j = 0; j < invaders.length; ++j) {
                let invader = invaders[j];
                if (intersects(invader.x, invader.y, invader.w, invader.h, bullet.x, bullet.y, bullet.w, bullet.h)) {
                    inter = j;
                    break;
                }
            }

            // если попала, удаляем пулю/врага и повышаем счет
            if (inter >= 0) {

                bullets.splice(i, 1);
                score += (3 - invaders[inter].tier) * 10;
                invaders.splice(inter, 1);

                update_leading_invaders();

                // все убиты
                if (invaders.length == 0) {
                    gameState = gameStateWin;
                    game_finished();
                }

                break;
            } else if (bullet.y < padding) { // пуля улетела за экран
                bullets.splice(i, 1);
                break;
            }
        }
    }

    // пришло время обновить состояние врага (одного, по индексу)
    if (elapsed > invader_it) {

        elapsed = 0.0;

        if (invader_index < invaders.length) {

            // двинуть врага и переключить фрейм (анимацию)
            let inv = invaders[invader_index];
            inv.ty = inv.th - inv.ty;
            inv.x += invader_speed * invader_dir;

            // противник стреляет
            if (Math.random() > 0.9 && inv.leading) {

                bullets.push(new Bullet(true, inv.x + inv.w / 2, inv.y + inv.h));

                let audio = new Audio("shoot.wav");
                audio.playbackRate = 4;
                audio.volume = 0.1;
                audio.play();
            }

            // противники долетели до игрока
            if (inv.y + inv.h > player.y) {
                gameState = gameStateEnd;
                game_finished();
            }
        }

        // индекс сл. врага в построении
        invader_index = (invader_index + 1) % invaders.length;

        // проверяем, нужно ли опустить ряды ниже и сменить направление движения
        for (let invader of invaders) {
            if ((invader_dir > 0 && invader.x > canvas.width - padding) || (invader_dir < 0 && invader.x < padding)) {

                if (invader_dir < 0) {
                    invader_index = (invader_index + invaders.length - 1) % invaders.length;
                }

                invader_dir = -invader_dir;

                for (let i = 0; i < invaders.length; ++i)
                    invaders[i].y += 32;

                break;
            }
        }
    }
}

// главный цикл отрисовки
function render() {

    // очищаем холст
    ctx.fillStyle = "black";
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // рисуем игрока
    player.render(ctx);

    // если экран смерти, затеняем противников
    // чтобы не сливались с текстом
    if (gameState == gameStateEnd)
        ctx.globalAlpha = 0.2;

    // рисуем врагов
    for (let invader of invaders)
        invader.render(ctx);

    ctx.globalAlpha = 1;

    // рисуем укрепления
    for (let block of blocks)
        block.render(ctx);

    // рисуем пули
    for (let bullet of bullets)
        bullet.render(ctx);

    // рисуем кол-во жизней
    if (life > 0) {

        ctx.fillStyle = "white";
        ctx.fillText(life, padding, canvas.height - padding);

        for (let i = 0; i < life; ++i) {
            ctx.drawImage(img, 277, 228, 26, 16, padding * 2 + (34 * i), canvas.height - padding * 2, 26, 16);
        }
    }

    // если пауза, рисуем рамку и лейбл
    if (gameState == gameStatePause) {
        ctx.strokeStyle = "#00fc00";
        ctx.lineDashOffset = totalTime * 50;//Величина смещения штрихов линии
        ctx.setLineDash([15]);
        ctx.strokeRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#00fc00";
        ctx.fillText(labelPauseText, (canvas.width - labelPause.width) / 2, fontSize);
    }

    // если проиграл, рисуем рамку, лейбл и счет (в центре)
    if (gameState == gameStateEnd) {
        ctx.strokeStyle = "#ff0000";
        ctx.lineDashOffset = totalTime * 50;
        ctx.setLineDash([15]);
        ctx.strokeRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#ff0000";
        let y = 100;
        ctx.fillText(labelEndText, (canvas.width - labelEnd.width) / 2, y + (fontSize + padding) * 1);
        ctx.fillStyle = "white";
        let text = ctx.measureText("Score: " + score);
        ctx.fillText("Score: " + score, (canvas.width - text.width) / 2, y + (fontSize + padding) * 2);
        text = ctx.measureText("High Score: " + highscore);
        ctx.fillText("High Score: " + highscore, (canvas.width - text.width) / 2, y + (fontSize + padding) * 3);
        return;
    }

    // если победил, рисуем рамку, лейбл и счет (в центре)
    if (gameState == gameStateWin) {
        ctx.strokeStyle = "yellow";
        ctx.lineDashOffset = totalTime * 50;
        ctx.setLineDash([15]);
        ctx.strokeRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "yellow";
        let y = 100;
        ctx.fillText(labelWinText, (canvas.width - labelWin.width) / 2, y + (fontSize + padding) * 1);
        ctx.fillStyle = "white";
        let text = ctx.measureText("Score: " + score);
        ctx.fillText("Score: " + score, (canvas.width - text.width) / 2, y + (fontSize + padding) * 2);
        text = ctx.measureText("High Score: " + highscore);//measureText - метод получения размеров текста
        ctx.fillText("High Score: " + highscore, (canvas.width - text.width) / 2, y + (fontSize + padding) * 3);
        return;
    }

    // счет в нижней части экрана
    ctx.fillStyle = "white";
    let text = ctx.measureText("Score: " + score);
    ctx.fillText("Score: " + score, 150, canvas.height - padding);
    ctx.fillText("High Score: " + highscore, 300, canvas.height - padding);
}

// загружаем текстуру
img.src = 'spritesheet.png';

// по завершении загрузки инициализируем данные игры
img.onload = function() {

    // построение противников
    let invader_rows = 5;
    let invader_cols = 11;
    let tiers = [0, 1, 1, 2, 2];
    let invader_prototype = new Invader();
    let off_w = 8;
    let off_h = 16;
    let off_x =  (canvas.width - (invader_prototype.w * invader_cols) - (off_w * (invader_cols - 1))) / 2;
    let off_y = padding * 3;
    let block_prototype = new Block();

    for (let r = 0; r < invader_rows; ++r) {
        for (let c = 0; c < invader_cols; ++c) {
            let tier = tiers[r];
            let invader = new Invader(
                tier,
                off_x + c * (invader_prototype.w + off_w),
                off_y + r * (invader_prototype.h + off_h),
                r, c
            );
            invaders.push(invader);
        }
    }

    // обновляем стрелков
    update_leading_invaders();

    // построение укреплений
    let block_off_x = (canvas.width - 7 * block_prototype.w) / 2;
    for (let i = 0; i < 4; ++i) {
        let block = new Block(
            block_off_x + i * block_prototype.w * 2,
            canvas.height - block_prototype.w * 2 - padding
        );
        blocks.push(block);
    }

    // кадр
    function main() {

        let now = Date.now();
        let dt = (now - lastTime) / 1000.0;

        totalTime += dt;
        elapsed += dt;

        update(dt);
        render();

        lastTime = now;
        requestAnimFrame(main);
    }

    main();
}
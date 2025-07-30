const WebSocket = require('ws');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
    if (req.url === '/' || req.url === '/index.html') {
        fs.readFile(path.join(__dirname, 'index.html'), 'utf8', (err, data) => {
            if (err) {
                res.writeHead(404);
                res.end('File not found');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(data);
        });
    } else {
        res.writeHead(404);
        res.end('Not found');
    }
});

const wss = new WebSocket.Server({ server });

const parties = new Map();
const users = new Map();
const games = new Map();

const questions = {
    easy: [
        { text: "What is the capital of France?", answer: "paris", category: "geography" },
        { text: "What is 2 + 2?", answer: "4", category: "general" },
        { text: "What color do you get when you mix red and blue?", answer: "purple", category: "general" },
        { text: "How many days are in a week?", answer: "7", category: "general" },
        { text: "What is the largest planet in our solar system?", answer: "jupiter", category: "science" },
        { text: "In which sport would you perform a slam dunk?", answer: "basketball", category: "sports" },
        { text: "What is the capital of Italy?", answer: "rome", category: "geography" },
        { text: "How many legs does a spider have?", answer: "8", category: "science" },
        { text: "What is the first letter of the alphabet?", answer: "a", category: "general" },
        { text: "Which ocean is the largest?", answer: "pacific", category: "geography" }
    ],
    hard: [
        { text: "What is the capital of Kazakhstan?", answer: "nur-sultan", category: "geography" },
        { text: "Who wrote 'Romeo and Juliet'?", answer: "shakespeare", category: "history" },
        { text: "What is the chemical symbol for gold?", answer: "au", category: "science" },
        { text: "In which year did World War II end?", answer: "1945", category: "history" },
        { text: "What is the square root of 144?", answer: "12", category: "general" },
        { text: "Which planet is closest to the Sun?", answer: "mercury", category: "science" },
        { text: "What is the longest river in the world?", answer: "nile", category: "geography" },
        { text: "Who painted the Mona Lisa?", answer: "da vinci", category: "history" },
        { text: "What is the fastest land animal?", answer: "cheetah", category: "science" },
        { text: "In tennis, what does 'love' mean?", answer: "zero", category: "sports" }
    ],
    impossible: [
        { text: "What is the 15th element on the periodic table?", answer: "phosphorus", category: "science" },
        { text: "Who was the first person to walk on the moon?", answer: "armstrong", category: "history" },
        { text: "What is the capital of Bhutan?", answer: "thimphu", category: "geography" },
        { text: "In what year was the first iPhone released?", answer: "2007", category: "general" },
        { text: "What is the scientific name for humans?", answer: "homo sapiens", category: "science" },
        { text: "Which country has won the most FIFA World Cups?", answer: "brazil", category: "sports" },
        { text: "What is the smallest country in the world?", answer: "vatican", category: "geography" },
        { text: "Who composed 'The Four Seasons'?", answer: "vivaldi", category: "history" },
        { text: "What is the hardest natural substance on Earth?", answer: "diamond", category: "science" },
        { text: "In which year did the Berlin Wall fall?", answer: "1989", category: "history" }
    ]
};

const badWords = [
    'fuck', 'shit', 'damn', 'bitch', 'ass', 'hell', 'crap', 'piss',
    'كلب', 'حمار', 'غبي', 'احمق', 'خنزير'
];

function generatePartyCode() {
    return crypto.randomBytes(3).toString('hex').toUpperCase();
}

function validateUsername(username) {
    if (!username || username.length < 3 || username.length > 12) return false;
    if (!/^[a-zA-Z\u0600-\u06FF]+$/.test(username)) return false;
    
    const lowerUsername = username.toLowerCase();
    if (badWords.some(word => lowerUsername.includes(word))) return false;
    
    return true;
}

function getRandomQuestions(category, difficulty, count = 10) {
    let pool = [];
    
    if (difficulty === 'random') {
        pool = [...questions.easy, ...questions.hard, ...questions.impossible];
    } else {
        pool = [...questions[difficulty]];
    }
    
    if (category !== 'general') {
        pool = pool.filter(q => q.category === category);
    }
    
    if (pool.length < count) {
        pool = [...questions.easy, ...questions.hard, ...questions.impossible];
    }
    
    const selected = [];
    for (let i = 0; i < count && pool.length > 0; i++) {
        const index = Math.floor(Math.random() * pool.length);
        selected.push(pool.splice(index, 1)[0]);
    }
    
    return selected;
}

function generateWrongAnswers(correctAnswer, playerAnswers = []) {
    const wrongAnswers = [];
    const usedAnswers = new Set([correctAnswer.toLowerCase()]);
    
    playerAnswers.forEach(answer => {
        if (answer && answer.toLowerCase() !== correctAnswer.toLowerCase()) {
            wrongAnswers.push(answer);
            usedAnswers.add(answer.toLowerCase());
        }
    });
    
    const commonWrongAnswers = [
        'london', 'paris', 'berlin', 'madrid', 'rome', 'tokyo', 'beijing',
        'blue', 'red', 'green', 'yellow', 'purple', 'orange', 'black', 'white',
        '1', '2', '3', '4', '5', '6', '7', '8', '9', '10',
        'yes', 'no', 'maybe', 'true', 'false', 'none', 'all', 'some'
    ];
    
    while (wrongAnswers.length < 4) {
        const randomWrong = commonWrongAnswers[Math.floor(Math.random() * commonWrongAnswers.length)];
        if (!usedAnswers.has(randomWrong.toLowerCase())) {
            wrongAnswers.push(randomWrong);
            usedAnswers.add(randomWrong.toLowerCase());
        }
    }
    
    return wrongAnswers.slice(0, 4);
}

function createParty(ws, data) {
    const code = generatePartyCode();
    const party = {
        code,
        hostId: data.userId,
        maxPlayers: data.playerCount,
        language: data.language,
        category: data.category,
        difficulty: data.difficulty,
        players: [{
            id: data.userId,
            username: data.username,
            ws: ws,
            isHost: true,
            score: 0,
            correctAnswers: 0,
            streak: 0
        }],
        status: 'waiting',
        createdAt: Date.now()
    };
    
    parties.set(code, party);
    
    setTimeout(() => {
        if (parties.has(code) && parties.get(code).status === 'waiting') {
            startGame(code);
        }
    }, 5 * 60 * 1000);
    
    ws.send(JSON.stringify({
        type: 'partyCreated',
        data: {
            code,
            hostId: party.hostId,
            maxPlayers: party.maxPlayers,
            players: party.players.map(p => ({
                id: p.id,
                username: p.username,
                isHost: p.isHost
            }))
        }
    }));
}

function joinParty(ws, data) {
    const party = parties.get(data.partyCode);
    
    if (!party) {
        ws.send(JSON.stringify({
            type: 'error',
            message: 'Party not found'
        }));
        return;
    }
    
    if (party.players.length >= party.maxPlayers) {
        ws.send(JSON.stringify({
            type: 'error',
            message: 'Party is full'
        }));
        return;
    }
    
    if (party.status !== 'waiting') {
        ws.send(JSON.stringify({
            type: 'error',
            message: 'Game already in progress'
        }));
        return;
    }
    
    const existingPlayer = party.players.find(p => p.id === data.userId);
    if (existingPlayer) {
        existingPlayer.ws = ws;
        ws.send(JSON.stringify({
            type: 'partyJoined',
            data: {
                code: party.code,
                hostId: party.hostId,
                maxPlayers: party.maxPlayers,
                players: party.players.map(p => ({
                    id: p.id,
                    username: p.username,
                    isHost: p.isHost
                }))
            }
        }));
        return;
    }
    
    party.players.push({
        id: data.userId,
        username: data.username,
        ws: ws,
        isHost: false,
        score: 0,
        correctAnswers: 0,
        streak: 0
    });
    
    broadcastToParty(party.code, {
        type: 'partyUpdate',
        data: {
            code: party.code,
            hostId: party.hostId,
            maxPlayers: party.maxPlayers,
            players: party.players.map(p => ({
                id: p.id,
                username: p.username,
                isHost: p.isHost
            }))
        }
    });
}

function leaveParty(ws, data) {
    const party = parties.get(data.partyCode);
    if (!party) return;
    
    const playerIndex = party.players.findIndex(p => p.ws === ws);
    if (playerIndex === -1) return;
    
    const player = party.players[playerIndex];
    party.players.splice(playerIndex, 1);
    
    if (party.players.length === 0) {
        parties.delete(data.partyCode);
        return;
    }
    
    if (player.isHost && party.players.length > 0) {
        party.players[0].isHost = true;
        party.hostId = party.players[0].id;
    }
    
    broadcastToParty(party.code, {
        type: 'partyUpdate',
        data: {
            code: party.code,
            hostId: party.hostId,
            maxPlayers: party.maxPlayers,
            players: party.players.map(p => ({
                id: p.id,
                username: p.username,
                isHost: p.isHost
            }))
        }
    });
}

function startGame(partyCode) {
    const party = parties.get(partyCode);
    if (!party || party.players.length < 2) return;
    
    party.status = 'playing';
    const gameQuestions = getRandomQuestions(party.category, party.difficulty, 10);
    
    const game = {
        partyCode,
        questions: gameQuestions,
        currentQuestion: 0,
        phase: 'input',
        answers: {},
        timer: null,
        startTime: Date.now()
    };
    
    games.set(partyCode, game);
    
    broadcastToParty(partyCode, {
        type: 'gameStarted',
        data: {
            currentQuestion: 0,
            questions: gameQuestions.map(q => ({
                text: q.text,
                difficulty: q.difficulty || party.difficulty
            })),
            phase: 'input'
        }
    });
    
    setTimeout(() => {
        moveToOptionsPhase(partyCode);
    }, 10000);
}

function submitAnswer(ws, data) {
    const user = users.get(ws);
    if (!user) return;
    
    const game = games.get(user.partyCode);
    if (!game || game.phase !== 'input') return;
    
    const currentQ = game.questions[game.currentQuestion];
    const isCorrect = data.answer.toLowerCase().trim() === currentQ.answer.toLowerCase();
    
    game.answers[user.id] = {
        answer: data.answer,
        correct: isCorrect,
        timestamp: Date.now()
    };
    
    const party = parties.get(user.partyCode);
    const player = party.players.find(p => p.id === user.id);
    
    if (isCorrect) {
        player.correctAnswers++;
        player.streak++;
        
        const difficulty = currentQ.difficulty || party.difficulty;
        let baseCoins = difficulty === 'easy' ? 5 : difficulty === 'hard' ? 7 : 9;
        let baseXP = baseCoins * 2;
        
        const streakMultiplier = 1 + (player.streak * 0.1);
        const coinsEarned = Math.floor(baseCoins * streakMultiplier);
        const xpEarned = Math.floor(baseXP * streakMultiplier);
        
        player.score += coinsEarned;
        
        ws.send(JSON.stringify({
            type: 'userUpdate',
            data: {
                coins: (user.coins || 0) + coinsEarned,
                xp: (user.xp || 0) + xpEarned,
                streak: player.streak
            }
        }));
    } else {
        player.streak = 0;
    }
}

function moveToOptionsPhase(partyCode) {
    const game = games.get(partyCode);
    const party = parties.get(partyCode);
    if (!game || !party) return;
    
    game.phase = 'options';
    
    const currentQ = game.questions[game.currentQuestion];
    const playerAnswers = Object.values(game.answers).map(a => a.answer);
    const wrongAnswers = generateWrongAnswers(currentQ.answer, playerAnswers);
    
    const options = [
        { text: currentQ.answer, correct: true },
        ...wrongAnswers.map(answer => ({ text: answer, correct: false }))
    ];
    
    for (let i = options.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [options[i], options[j]] = [options[j], options[i]];
    }
    
    currentQ.options = options;
    
    broadcastToParty(partyCode, {
        type: 'questionUpdate',
        data: {
            currentQuestion: game.currentQuestion,
            phase: 'options',
            questions: game.questions.map(q => ({
                text: q.text,
                difficulty: q.difficulty || party.difficulty,
                options: q.options
            }))
        }
    });
    
    setTimeout(() => {
        nextQuestion(partyCode);
    }, 10000);
}

function selectOption(ws, data) {
    const user = users.get(ws);
    if (!user) return;
    
    const game = games.get(user.partyCode);
    if (!game || game.phase !== 'options') return;
    
    const currentQ = game.questions[game.currentQuestion];
    const selectedOption = currentQ.options[data.optionIndex];
    
    if (!game.answers[user.id] || !game.answers[user.id].correct) {
        game.answers[user.id] = {
            ...game.answers[user.id],
            optionAnswer: selectedOption.text,
            optionCorrect: selectedOption.correct
        };
        
        const party = parties.get(user.partyCode);
        const player = party.players.find(p => p.id === user.id);
        
        if (selectedOption.correct) {
            player.correctAnswers++;
            const difficulty = currentQ.difficulty || party.difficulty;
            const baseCoins = difficulty === 'easy' ? 3 : difficulty === 'hard' ? 4 : 5;
            player.score += baseCoins;
        }
    }
}

function nextQuestion(partyCode) {
    const game = games.get(partyCode);
    if (!game) return;
    
    game.currentQuestion++;
    
    if (game.currentQuestion >= game.questions.length) {
        endGame(partyCode);
        return;
    }
    
    game.phase = 'input';
    game.answers = {};
    
    broadcastToParty(partyCode, {
        type: 'questionUpdate',
        data: {
            currentQuestion: game.currentQuestion,
            phase: 'input',
            questions: game.questions.map(q => ({
                text: q.text,
                difficulty: q.difficulty || parties.get(partyCode).difficulty
            }))
        }
    });
    
    setTimeout(() => {
        moveToOptionsPhase(partyCode);
    }, 10000);
}

function endGame(partyCode) {
    const party = parties.get(partyCode);
    const game = games.get(partyCode);
    if (!party || !game) return;
    
    party.status = 'finished';
    
    const results = {
        players: party.players.map(p => ({
            id: p.id,
            username: p.username,
            score: p.score,
            correctAnswers: p.correctAnswers
        })).sort((a, b) => b.score - a.score)
    };
    
    broadcastToParty(partyCode, {
        type: 'gameEnded',
        data: results
    });
    
    games.delete(partyCode);
    
    setTimeout(() => {
        const newCode = generatePartyCode();
        party.code = newCode;
        party.status = 'waiting';
        party.players.forEach(p => {
            p.score = 0;
            p.correctAnswers = 0;
            p.streak = 0;
        });
        
        parties.delete(partyCode);
        parties.set(newCode, party);
        
        broadcastToParty(newCode, {
            type: 'partyUpdate',
            data: {
                code: newCode,
                hostId: party.hostId,
                maxPlayers: party.maxPlayers,
                players: party.players.map(p => ({
                    id: p.id,
                    username: p.username,
                    isHost: p.isHost
                }))
            }
        });
        
        setTimeout(() => {
            if (parties.has(newCode) && parties.get(newCode).status === 'waiting') {
                parties.delete(newCode);
            }
        }, 60000);
    }, 30000);
}

function broadcastToParty(partyCode, message) {
    const party = parties.get(partyCode);
    if (!party) return;
    
    party.players.forEach(player => {
        if (player.ws && player.ws.readyState === WebSocket.OPEN) {
            player.ws.send(JSON.stringify(message));
        }
    });
}

function cleanupExpiredParties() {
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;
    
    for (const [code, party] of parties.entries()) {
        if (party.status === 'waiting' && now - party.createdAt > fiveMinutes) {
            parties.delete(code);
        }
    }
}

setInterval(cleanupExpiredParties, 60000);

wss.on('connection', (ws) => {
    console.log('New client connected');
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            switch (data.type) {
                case 'join':
                    users.set(ws, {
                        id: data.data.userId,
                        username: data.data.username,
                        ws: ws
                    });
                    break;
                    
                case 'createParty':
                    if (!validateUsername(data.data.username)) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Invalid username'
                        }));
                        return;
                    }
                    users.set(ws, {
                        id: data.data.userId,
                        username: data.data.username,
                        partyCode: null
                    });
                    createParty(ws, data.data);
                    break;
                    
                case 'joinParty':
                    if (!validateUsername(data.data.username)) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Invalid username'
                        }));
                        return;
                    }
                    users.set(ws, {
                        id: data.data.userId,
                        username: data.data.username,
                        partyCode: data.data.partyCode
                    });
                    joinParty(ws, data.data);
                    break;
                    
                case 'leaveParty':
                    leaveParty(ws, data.data);
                    break;
                    
                case 'startGame':
                    const user = users.get(ws);
                    if (user) {
                        startGame(data.data.partyCode);
                    }
                    break;
                    
                case 'submitAnswer':
                    submitAnswer(ws, data.data);
                    break;
                    
                case 'selectOption':
                    selectOption(ws, data.data);
                    break;
                    
                case 'leaveGame':
                    const gameUser = users.get(ws);
                    if (gameUser) {
                        leaveParty(ws, { partyCode: gameUser.partyCode });
                    }
                    break;
            }
        } catch (error) {
            console.error('Error handling message:', error);
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Invalid message format'
            }));
        }
    });
    
    ws.on('close', () => {
        console.log('Client disconnected');
        const user = users.get(ws);
        if (user && user.partyCode) {
            leaveParty(ws, { partyCode: user.partyCode });
        }
        users.delete(ws);
    });
    
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Quiz Game WebSocket Server running on port ${PORT}`);
});

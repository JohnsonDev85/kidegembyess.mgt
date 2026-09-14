// ===== FIREBASE CONFIG =====
const firebaseConfig = {
  apiKey: "AIzaSyDSlJ9pcA2_0UjO3tfPhhXwXeus1nLTSAI",
  authDomain: "mfumo-wa-miradi-kide-ss.firebaseapp.com",
  databaseURL: "https://mfumo-wa-miradi-kide-ss-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "mfumo-wa-miradi-kide-ss",
  storageBucket: "mfumo-wa-miradi-kide-ss.firebasestorage.app",
  messagingSenderId: "1044953573905",
  appId: "1:1044953573905:web:363aeb90a11e8d6c86dfb0",
  measurementId: "G-C83NKMR42V"
};
const firebaseApp = firebase.apps.length ? firebase.app() : firebase.initializeApp(firebaseConfig);
const firestore = firebase.firestore();

// ===== KULAZIMISHA LONG-POLLING (SI STREAMING) =====
// Baadhi ya mitandao ya simu (Vodacom, Tigo, Airtel n.k) huzuia muunganiko wa
// aina ya WebChannel/streaming ambao Firestore hutumia kwa default, hata kama
// mtandao ni imara. Hii husababisha kosa "Failed to get document because the
// client is offline" ingawa mtandao upo. Kulazimisha long-polling kunatatua
// tatizo hili kwa mitandao ya aina hiyo.
// NOTE: firestore.settings() inaruhusiwa kuitwa MARA MOJA TU kwa maisha ya
// ukurasa - ikiitwa mara ya pili (mfano CodePen ikifanya "re-run" bila
// kupiga refresh kamili), inatupa hitilafu ambayo ingesimamisha script nzima
// isiendelee. try/catch hii inazuia hilo.
try {
  firestore.settings({
    experimentalForceLongPolling: true,
    merge: true
  });
} catch (e) {
  console.warn("Firestore settings tayari zimewekwa awali:", e.message);
}

// ===== OFFLINE PERSISTENCE (KUMBUKUMBU YA NDANI) =====
// Inahifadhi nakala ya data ndani ya kifaa (browser). Mara ya pili
// unapofungua/login, data ya awali inaonekana PAPO KWA HAPO kutoka kwenye
// hiyo kumbukumbu, wakati data mpya inasasishwa (sync) kimya kimya nyuma.
// Hii ndiyo inatoa hisia ya "fast" kwenye matumizi ya kila siku.
// NOTE: Kama settings() hapo juu, hii pia inaruhusiwa mara moja tu - try/catch
// inazuia isisimamishe script nzima ikiitwa mara ya pili.
try {
  firestore.enablePersistence({ synchronizeTabs: true })
    .catch(err => {
      if (err.code === 'failed-precondition') {
        // Kuna tab nyingine ya app hii tayari iko wazi - persistence
        // inaweza kuwashwa tab moja kwa wakati mmoja tu (si tatizo kubwa).
        console.warn("Persistence: tabs nyingi ziko wazi.");
      } else if (err.code === 'unimplemented') {
        // Browser hii haitumii offline persistence - app itaendelea kufanya
        // kazi kama kawaida, bila hiyo faida ya cache ya papo kwa hapo.
        console.warn("Persistence: browser hii haiunga mkono.");
      }
    });
} catch (e) {
  console.warn("Persistence haikuwezekana kuwashwa (labda tayari imeanzishwa):", e.message);
}

// ===== KUUNGANISHA KIMYA NA FIREBASE (KWA USALAMA) =====
firebase.auth().signInAnonymously()
  .catch((error) => {
    console.error("Auth error:", error);
  });

// Inahakikisha auth (anonymous) imekamilika kabla ya kutuma ombi lolote la
// Firestore. Bila hii, kubonyeza Login mapema sana (kabla auth haijakamilika)
// kunaweza kusababisha "Missing or insufficient permissions" kwa sababu
// ombi linatumwa kabla mtumiaji hajathibitishwa.
function ensureAuthenticated() {
  return new Promise((resolve, reject) => {
    if (firebase.auth().currentUser) {
      resolve(firebase.auth().currentUser);
      return;
    }
    const unsubscribe = firebase.auth().onAuthStateChanged(user => {
      unsubscribe();
      if (user) {
        resolve(user);
      } else {
        firebase.auth().signInAnonymously()
          .then(cred => resolve(cred.user))
          .catch(reject);
      }
    }, reject);
  });
}

// ===== HOSTEL REQUIRED AMOUNTS (per student, per muhula) =====
const HOSTEL_REQUIRED = {
  ada_hostel: 61500,
  ada_taaluma: 10000,
  mahindi: 5,
  maharage: 1.5,
  mchele: 10
};

// ===== MAZIWA: BEI YA LITA KWA WATEJA WA ORDER (MKOPO) =====
const MAZIWA_BEI_LITA = 1500;

// ===== LOGIN SYSTEM =====
let currentRole = null;
let listenersStarted = false;

async function getPasswordsDocWithRetry(maxTries = 3) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxTries; attempt++) {
    try {
      const doc = await firestore.collection('settings').doc('passwords').get();
      return doc;
    } catch (e) {
      lastError = e;
      // Ngoja kidogo kabla ya kujaribu tena (500ms, 1000ms, 1500ms...)
      if (attempt < maxTries) {
        await new Promise(resolve => setTimeout(resolve, attempt * 500));
      }
    }
  }
  throw lastError;
}

async function checkLogin() {
  const password = document.getElementById('loginPassword').value;
  try {
    await ensureAuthenticated();
    const doc = await getPasswordsDocWithRetry();
    const passwords = doc.data();

    if (password === passwords.manager) {
      currentRole = 'supervisor';
      showMainApp('manager', ' Supervisor');
    } else if (password === passwords.hos) {
      currentRole = 'hos';
      showMainApp('hos', ' Head of School');
    } else if (password === passwords.burser) {
      currentRole = 'accountant';
      showMainApp('accountant', '  Mhasibu');
    } else if (password === passwords.bweni) {
      currentRole = 'hostelmanager';
      showMainApp('hostelmanager', ' Msimamizi wa Hostel');
    } else {
      alert("❌ Password si sahihi!");
    }
  } catch(e) {
    alert("❌ Connection problem: " + e.message + "\n\nJaribu tena, au hakikisha una mtandao strong (data/WiFi) kisha bonyeza Login tena.");
  }
}

function showMainApp(roleValue, userText) {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('mainApp').style.display = 'block';
  document.getElementById('roleSelect').value = roleValue;
  document.getElementById('userLabel').innerText = userText;
  switchRole();
  if (!listenersStarted) { startListeners(); listenersStarted = true; }
}

function logout() {
  currentRole = null;
  document.getElementById('mainApp').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('loginPassword').value = '';
  window.location.reload();
}

// ===== CORE STATE =====
let db = { maziwa: [], saloon: [], mgahawa: [], duka: [] };
let supervisors = { maziwa: "Not-found", saloon: "Not-found", mgahawa: "Not-found", duka: "Not-found" };
let requests = [];
let currentPeriod = 'month';

// ===== NOTIFICATIONS STATE =====
let notifications = [];
let sectionsInitialized = { maziwa: false, saloon: false, mgahawa: false, duka: false };

// ===== HOSTEL STATE =====
let hostelInfo = { msimamizi: "Not-found" };
let hostelMalipo = [];
let hostelMatumizi = [];
let hostelMalipoInitialized = false;
let hostelMatumiziInitialized = false;
let hostelBalance = 0;
const DARASA_ORDER = ['Form 1', 'Form 2', 'Form 3', 'Form 4'];

// ===== HOSTEL: EDIT MODE (kuhariri rekodi ya malipo iliyopo) =====
let editingHostelMalipoId = null;

// ===== HOSTEL: MASHINE (PUMBA) - SALIO TOFAUTI KABISA NA HOSTEL =====
let hostelMashine = [];
let hostelMashineInitialized = false;
let mashineBalance = 0;

// ===== HOS: SUB-TAB YA HOSTEL (mashine | taaluma | michango) =====
let currentHosHostelSubTab = 'mashine';

// ===== ORODHA YA WANAFUNZI (kwa ajili ya dropdown ya Hostel) =====
let wanafunziOrodha = [];

// ===== MAZIWA WATEJA STATE =====
let maziwaWateja = [];
let maziwaOda = [];
let maziwaMalipoWateja = [];
let mazwaOdaInitialized = false;

// ===== REAL-TIME LISTENERS =====
// NOTE: Tumeongeza .limit() kwenye listeners zenye uwezekano wa kukua kubwa,
// ili app isome tu records za hivi karibuni badala ya database nzima kila wakati.
// Hii inaboresha speed kadri data inavyoongezeka miezi/miaka ijayo.
// ===== LISTENERS ZA MSINGI (KWA SPEED) =====
// Kila role sasa inapakua data inayoihitaji TU, badala ya collections zote 11
// kila mtu anapo-login. Hii inapunguza sana muda wa kupakia (load time) na
// idadi ya usomaji wa Firestore (reads), hasa muhimu kwenye mtandao dhaifu.
function startListeners() {
  const role = currentRole; // 'supervisor' | 'hos' | 'accountant' | 'hostelmanager'

  // ===== SETTINGS: MAJINA YA WASIMAMIZI WA MIRADI =====
  // Inahitajika na: Supervisor (kuonyesha jina lake), HOS (kuweka/kuona majina)
  if (role === 'supervisor' || role === 'hos') {
    firestore.collection('settings').doc('supervisors').onSnapshot(doc => {
      if (doc.exists) {
        supervisors = doc.data();
        loadSupervisors();
      }
    });
  }

  // ===== MIRADI MINNE: MAZIWA/SALOON/MGAHAWA/DUKA =====
  // Inahitajika na: HOS (ripoti), Mhasibu (mahesabu ya salio)
  if (role === 'hos' || role === 'accountant') {
    ['maziwa', 'saloon', 'mgahawa', 'duka'].forEach(section => {
      firestore.collection(section).orderBy('tarehe', 'desc').limit(200).onSnapshot(snapshot => {
        db[section] = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

        if (sectionsInitialized[section]) {
          snapshot.docChanges().forEach(change => {
            if (change.type === 'added') {
              const d = change.doc.data();
              const amount = d.pesa || d.mauzo || d.jumla_mauzo || 0;
              if (currentRole === 'hos' || currentRole === 'accountant') {
                addNotification(`📥 ${d.msimamizi || 'Msimamizi'} amewasilisha mauzo mapya ya ${section.toUpperCase()} - TZS ${amount.toLocaleString()}`);
              }
            }
          });
        } else {
          sectionsInitialized[section] = true;
        }

        renderTables();
        calculateAdminSummary();
        calculateAccountantBalances();
        if (currentRole === 'hos') calculateHosDailyDashboard();
        if (currentRole === 'accountant') renderAccountantDashboard();
      });
    });
  }

  // ===== MAOMBI YA MATUMIZI (requests) =====
  // Inahitajika na: HOS (kuidhinisha), Mhasibu (kutoa fedha)
  if (role === 'hos' || role === 'accountant') {
    firestore.collection('requests').limit(300).onSnapshot(snapshot => {
      requests = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      renderAdminRequests();
      renderAdminApprovedExpenses();
      calculateAdminSummary();
      calculateAccountantBalances();
      if (currentRole === 'hos') calculateHosDailyDashboard();
      if (currentRole === 'accountant') renderAccountantDashboard();
    });
  }

  // ===== HOSTEL INFO (jina la msimamizi wa hostel) =====
  // Inahitajika na: HOS, Msimamizi wa Hostel
  if (role === 'hos' || role === 'hostelmanager') {
    firestore.collection('settings').doc('hostelInfo').onSnapshot(doc => {
      if (doc.exists) {
        hostelInfo = doc.data();
        loadHostelInfo();
      }
    });
  }

  // ===== HOSTEL MALIPO (malipo ya wanafunzi) =====
  // Inahitajika na: HOS, Mhasibu, Msimamizi wa Hostel
  if (role === 'hos' || role === 'accountant' || role === 'hostelmanager') {
    firestore.collection('hostel_malipo').orderBy('tarehe', 'desc').limit(300).onSnapshot(snapshot => {
      hostelMalipo = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

      if (hostelMalipoInitialized) {
        snapshot.docChanges().forEach(change => {
          if (change.type === 'added') {
            const d = change.doc.data();
            if (currentRole === 'hos' || currentRole === 'accountant') {
              addNotification(` ${d.msimamizi || 'Msimamizi wa Hostel'} ameongeza mwanafunzi ${d.jina_mwanafunzi || ''} - Hostel`);
            }
          }
        });
      } else {
        hostelMalipoInitialized = true;
      }

      renderHostelStudentsList();
      if (currentRole === 'accountant') renderHostelAccountantDashboard();
      if (currentRole === 'hos') {
        renderHosHostelSummary();
        renderHosTaalumaSubTab();
        renderHosMichangoSubTab();
      }
      if (currentRole === 'hostelmanager') onHostelStudentSelected();
    });
  }

  // ===== HOSTEL MATUMIZI =====
  // Inahitajika na: HOS, Mhasibu, Msimamizi wa Hostel
  if (role === 'hos' || role === 'accountant' || role === 'hostelmanager') {
    firestore.collection('hostel_matumizi').limit(200).onSnapshot(snapshot => {
      hostelMatumizi = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

      if (hostelMatumiziInitialized) {
        snapshot.docChanges().forEach(change => {
          if (change.type === 'added') {
            const d = change.doc.data();
            if (currentRole === 'hos') {
              addNotification(` Ombi  la matumizi ya Hostel: ${d.jina} - TZS ${(d.gharama || 0).toLocaleString()}`);
            }
          }
        });
      } else {
        hostelMatumiziInitialized = true;
      }
      renderHostelRequests();
      if (currentRole === 'accountant') renderHostelAccountantDashboard();
    });
  }

  // ===== COMMENTS (news popup) - Supervisor pekee =====
  if (role === 'supervisor') {
    firestore.collection('comments').orderBy('timestamp', 'desc').limit(1).onSnapshot(snapshot => {
      if (!snapshot.empty && currentRole === 'supervisor') {
        let commentData = snapshot.docs[0].data();
        let commentId = snapshot.docs[0].id;

        if (!commentData.reply) {
          document.getElementById('newsPopup').style.display = 'block';
          document.getElementById('popupMessage').innerText = `[Agizo Idara ya ${commentData.idara.toUpperCase()}]: ${commentData.ujumbe}`;
          window.currentActiveCommentId = commentId;
        }
      }
    });
  }

  // ===== MAZIWA WATEJA (orodha ya majina ya wateja) =====
  // Inahitajika na: Supervisor (oda/bill), Mhasibu (kurekodi malipo)
  if (role === 'supervisor' || role === 'accountant') {
    firestore.collection('maziwa_wateja').orderBy('jina').onSnapshot(snapshot => {
      maziwaWateja = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      renderMazwaWatejaDropdowns();
      renderMazwaWatejaList();
    });
  }

  // ===== MAZIWA ODA (oda za wateja) =====
  // Inahitajika na: Supervisor (kutuma/ku-print bill), HOS (jedwali la oda)
  if (role === 'supervisor' || role === 'hos') {
    firestore.collection('maziwa_oda').orderBy('tarehe', 'desc').limit(200).onSnapshot(snapshot => {
      maziwaOda = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

      if (mazwaOdaInitialized) {
        snapshot.docChanges().forEach(change => {
          if (change.type === 'added' && currentRole === 'hos') {
            const d = change.doc.data();
            addNotification(`🥛 Oda mpya: ${d.jina_mteja} amechukua Lt${d.lita} (TZS ${d.kiasi.toLocaleString()})`);
          }
        });
      } else {
        mazwaOdaInitialized = true;
      }

      renderHodMazwaOdaTable();
      calculateAccountantBalances();
    });
  }

  // ===== MAZIWA MALIPO WATEJA (Mhasibu pekee anarekodi/anaona) =====
  if (role === 'accountant') {
    firestore.collection('maziwa_malipo_wateja').orderBy('tarehe', 'desc').limit(200).onSnapshot(snapshot => {
      maziwaMalipoWateja = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      renderAccMalipoWatejaTable();
      calculateAccountantBalances();
    });
  }

  // ===== ORODHA YA WANAFUNZI (kwa dropdown ya Hostel) =====
  // Inahitajika na: HOS (kusimamia/kupakia Excel), Msimamizi wa Hostel (dropdown)
  if (role === 'hos' || role === 'hostelmanager') {
    firestore.collection('wanafunzi_orodha').orderBy('jina').onSnapshot(snapshot => {
      wanafunziOrodha = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      renderWanafunziOrodhaManage();
      populateStudentDropdown();
    });
  }

  // ===== HOSTEL MASHINE (Pumba) - Salio tofauti kabisa na Hostel =====
  // Inahitajika na: HOS, Mhasibu, Msimamizi wa Hostel
  if (role === 'hos' || role === 'accountant' || role === 'hostelmanager') {
    firestore.collection('hostel_mashine').orderBy('tarehe', 'desc').limit(200).onSnapshot(snapshot => {
      hostelMashine = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

      if (hostelMashineInitialized) {
        snapshot.docChanges().forEach(change => {
          if (change.type === 'added') {
            const d = change.doc.data();
            if (currentRole === 'hos' || currentRole === 'accountant') {
              addNotification(`⚙️ Mashine: Mauzo mapya ya Pumba - TZS ${(d.jumla_mauzo || 0).toLocaleString()}`);
            }
          }
        });
      } else {
        hostelMashineInitialized = true;
      }

      renderHostelMashineList();
      if (currentRole === 'accountant') renderMashineAccountantSection();
      if (currentRole === 'hos') renderHosMashineSubTab();
    });
  }
}

// ===== TOGGLE FORM (Sales / Expense / Wateja wa Order - Maziwa) =====
function toggleForm() {
    const mradi = document.getElementById('mradiSelect').value;
    const watejaOpt = document.getElementById('opt-wateja-mkopo');
    if (watejaOpt) watejaOpt.style.display = mradi === 'maziwa' ? 'block' : 'none';

    let type = document.getElementById('infoTypeSelect').value;
    if (mradi !== 'maziwa' && type === 'wateja') {
        type = 'sales';
        document.getElementById('infoTypeSelect').value = 'sales';
    }

    document.querySelectorAll('.project-form').forEach(f => f.classList.remove('active'));
    if (type === 'expense') {
        document.getElementById('expense-request-form').classList.add('active');
        document.getElementById('exp-idara').value = mradi;
    } else if (type === 'wateja') {
        document.getElementById('form-maziwa-wateja').classList.add('active');
        renderMazwaWatejaDropdowns();
        renderMazwaWatejaList();
    } else {
        document.getElementById(`form-${mradi}-sales`).classList.add('active');
    }
}

// ===== ROLE SWITCH + THEME =====
function switchRole() {
    const role = document.getElementById('roleSelect').value;

    const themeMap = {
        manager: 'theme-supervisor',
        hos: 'theme-hos',
        accountant: 'theme-accountant',
        hostelmanager: 'theme-hostel'
    };
    document.body.className = themeMap[role] || '';

    updateNotifBellVisibility();
    document.getElementById('managerView').style.display = role === 'manager' ? 'block' : 'none';
    document.getElementById('hosView').style.display = role === 'hos' ? 'block' : 'none';
    document.getElementById('accountantDashboard').style.display = role === 'accountant' ? 'block' : 'none';
    const hostelView = document.getElementById('hostelManagerView');
    if (hostelView) hostelView.style.display = role === 'hostelmanager' ? 'block' : 'none';

    if (role === 'manager') {
        toggleForm();
    }
    if (role === 'hostelmanager') {
        loadHostelInfo();
        renderHostelStudentsList();
        populateStudentDropdown();
    }
    if (role === 'hos') {
        renderHostelRequests();
        renderHosHostelSummary();
        renderAdminRequests();
        renderAdminApprovedExpenses();
        calculateAdminSummary();
        calculateHosDailyDashboard();
        loadSupervisors();
        renderWanafunziOrodhaManage();
    }
    if (role === 'accountant') {
        renderAccountantDashboard();
        renderHostelAccountantDashboard();
        renderMashineAccountantSection();
    }
}

// ===== SUPERVISORS =====
function saveSupervisors(e) {
    e.preventDefault();
    const newSupervisors = {
        maziwa: document.getElementById('set-msimamizi-maziwa').value,
        saloon: document.getElementById('set-msimamizi-saloon').value,
        mgahawa: document.getElementById('set-msimamizi-mgahawa').value,
        duka: document.getElementById('set-msimamizi-duka').value
    };
    firestore.collection('settings').doc('supervisors').set(newSupervisors)
      .then(() => alert("Supervisors are saved successifully!"))
      .catch(e => alert("Kosa: " + e.message));
}

// ===== SALES SUBMISSIONS =====
function saveMaziwaSales(e) {
    e.preventDefault();
    let p = parseFloat(document.getElementById('maziwa-p').value) || 0;
    let record = {
        tarehe: document.getElementById('maziwa-t').value,
        msimamizi: supervisors.maziwa,
        kamuliwa: parseFloat(document.getElementById('maziwa-kam').value) || 0,
        uzwa: parseFloat(document.getElementById('maziwa-uz').value) || 0,
        baki: (parseFloat(document.getElementById('maziwa-kam').value) || 0) - (parseFloat(document.getElementById('maziwa-uz').value) || 0),
        pesa: p,
        mhasibu: parseFloat(document.getElementById('maziwa-mhasibu').value) || 0,
        status_mhasibu: 'pending',
        matumizi_jina: "No any", matumizi_gharama: 0, faida: p
    };
    firestore.collection('maziwa').add(record)
      .then(() => saveAndRefresh('form-maziwa-sales'))
      .catch(e => alert("Kosa: " + e.message));
}

function saveSaloonSales(e) {
    e.preventDefault();
    let p = parseFloat(document.getElementById('saloon-p').value) || 0;
    let record = {
        tarehe: document.getElementById('saloon-t').value,
        msimamizi: supervisors.saloon,
        watu: parseInt(document.getElementById('saloon-w').value) || 0,
        pesa: p,
        mhasibu: parseFloat(document.getElementById('saloon-mhasibu').value) || 0,
        status_mhasibu: 'pending',
        matumizi_jina: "No any", matumizi_gharama: 0, faida: p
    };
    firestore.collection('saloon').add(record)
      .then(() => saveAndRefresh('form-saloon-sales'))
      .catch(e => alert("Kosa: " + e.message));
}

function saveMgahawaSales(e) {
    e.preventDefault();
    let gh = parseFloat(document.getElementById('mgahawa-gh').value) || 0;
    let mauzo = parseFloat(document.getElementById('mgahawa-p').value) || 0;
    let record = {
        tarehe: document.getElementById('mgahawa-t').value,
        msimamizi: supervisors.mgahawa,
        vitu: document.getElementById('mgahawa-v').value,
        gharama: gh,
        mauzo: mauzo,
        mhasibu: parseFloat(document.getElementById('mgahawa-mhasibu').value) || 0,
        status_mhasibu: 'pending',
        matumizi_jina: "No any", matumizi_gharama: 0, faida: mauzo - gh
    };
    firestore.collection('mgahawa').add(record)
      .then(() => saveAndRefresh('form-mgahawa-sales'))
      .catch(e => alert("Kosa: " + e.message));
}

function saveDukaSales(e) {
    e.preventDefault();
    let gh = parseFloat(document.getElementById('duka-gh').value) || 0;
    let mauzo = parseFloat(document.getElementById('duka-p').value) || 0;
    let record = {
        tarehe: document.getElementById('duka-t').value,
        msimamizi: supervisors.duka,
        vitu: document.getElementById('duka-v').value,
        gharama: gh,
        mauzo: mauzo,
        mhasibu: parseFloat(document.getElementById('duka-mhasibu').value) || 0,
        status_mhasibu: 'pending',
        matumizi_jina: "No-any", matumizi_gharama: 0, faida: mauzo - gh
    };
    firestore.collection('duka').add(record)
      .then(() => saveAndRefresh('form-duka-sales'))
      .catch(e => alert("Kosa: " + e.message));
}

function loadSupervisors() {
    document.getElementById('set-msimamizi-maziwa').value = supervisors.maziwa || "Not-found";
    document.getElementById('set-msimamizi-saloon').value = supervisors.saloon || "Not-found";
    document.getElementById('set-msimamizi-mgahawa').value = supervisors.mgahawa || "Not-found";
    document.getElementById('set-msimamizi-duka').value = supervisors.duka || "Not-found";

    document.getElementById('m-maziwa').value = supervisors.maziwa || "Not-found";
    document.getElementById('m-saloon').value = supervisors.saloon || "Not-found";
    document.getElementById('m-mgahawa').value = supervisors.mgahawa || "Not-found";
    document.getElementById('m-duka').value = supervisors.duka || "Not-found";
}

// ===== DELETE RECORD (generic) =====
function deleteRecord(collection, id) {
    if (confirm(" Una uhakika unataka kufuta record hii? Haiwezi kurudishwa!")) {
        firestore.collection(collection).doc(id).delete()
          .catch(e => alert("Error in Deleting: " + e.message));
    }
}

// ===== EXPENSE REQUESTS =====
function submitExpenseRequest(e) {
    e.preventDefault();
    const idara = document.getElementById('exp-idara').value;
    const record = {
        tarehe: document.getElementById('exp-t').value,
        idara: idara,
        msimamizi: supervisors[idara] || "Not-found",
        jina: document.getElementById('exp-jina').value,
        gharama: parseFloat(document.getElementById('exp-gharama').value) || 0,
        status: 'pending',
        status_fedha: 'unpaid'
    };
    firestore.collection('requests').add(record).then(() => {
        document.getElementById('expense-request-form').reset();
        alert("Request has been successifully sent to Head of School!");
    }).catch(e => alert("Kosa: " + e.message));
}

function renderAdminRequests() {
    const tbody = document.getElementById('table-pending-requests');
    if(!tbody) return;
    tbody.innerHTML = '';
    requests.filter(r => r.status === 'pending').forEach(r => {
        tbody.innerHTML += `
            <tr>
                <td>${r.tarehe}</td>
                <td style="text-transform:capitalize;">${r.idara}</td>
                <td>${r.msimamizi}</td>
                <td>${r.jina}</td>
                <td>${r.gharama.toLocaleString()}</td>
                <td>
                    <button class="btn-approve" onclick="approveRequest('${r.id}')">Accept</button>
                    <button class="btn-reject" onclick="rejectRequest('${r.id}')">Reject</button>
                    <button onclick="deleteRecord('requests','${r.id}')" style="background:#e74c3c;color:white;border:none;padding:6px 10px;border-radius:4px;cursor:pointer;font-size:12px;">🗑</button>
                </td>
            </tr>`;
    });
}

function approveRequest(id) {
    firestore.collection('requests').doc(id).update({ status: 'approved' })
      .catch(e => alert("Kosa: " + e.message));
}

function rejectRequest(id) {
    firestore.collection('requests').doc(id).update({ status: 'rejected' })
      .catch(e => alert("Kosa: " + e.message));
}

function renderAdminApprovedExpenses() {
    const tbody = document.getElementById('table-admin-expenses');
    if(!tbody) return;
    tbody.innerHTML = '';
    requests.filter(r => r.status === 'approved').forEach(r => {
        tbody.innerHTML += `<tr><td>${r.tarehe}</td><td style="text-transform:capitalize;">${r.idara}</td><td>${r.jina}</td><td>${r.gharama.toLocaleString()}</td><td><button onclick="deleteRecord('requests','${r.id}')" style="background:#e74c3c;color:white;border:none;padding:6px 10px;border-radius:4px;cursor:pointer;font-size:12px;"> Delete</button></td></tr>`;
    });
}

function saveAndRefresh(formId) {
    document.getElementById(formId).reset();
    loadSupervisors();
    document.getElementById('successAlert').style.display = 'block';
    setTimeout(() => { document.getElementById('successAlert').style.display = 'none'; }, 3000);
}

// ===== RENDER TABLES =====
function renderTables() {
    const draw = (id, arr, type, col) => {
        const tbody = document.getElementById(id);
        if(!tbody) return;
        let html = '';
        arr.forEach(d => {
            let delBtn = `<button onclick="deleteRecord('${col}','${d.id}')" style="background:#e74c3c;color:white;border:none;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:12px;"> Delete</button>`;
            if(type === 'm') html += `<tr><td>${d.tarehe}</td><td>${d.msimamizi}</td><td>${d.kamuliwa}</td><td>${d.uzwa}</td><td>${d.baki}</td><td>${d.pesa.toLocaleString()}</td><td>${d.mhasibu.toLocaleString()}</td><td>${d.matumizi_jina}</td><td>${d.matumizi_gharama.toLocaleString()}</td><td style="font-weight:bold;color:${d.faida>=0?'green':'red'}">${d.faida.toLocaleString()}</td><td>${delBtn}</td></tr>`;
            if(type === 's') html += `<tr><td>${d.tarehe}</td><td>${d.msimamizi}</td><td>${d.watu}</td><td>${d.pesa.toLocaleString()}</td><td>${d.mhasibu.toLocaleString()}</td><td>${d.matumizi_jina}</td><td>${d.matumizi_gharama.toLocaleString()}</td><td style="font-weight:bold;color:${d.faida>=0?'green':'red'}">${d.faida.toLocaleString()}</td><td>${delBtn}</td></tr>`;
            if(type === 'mg') html += `<tr><td>${d.tarehe}</td><td>${d.msimamizi}</td><td>${d.vitu}</td><td>${d.gharama.toLocaleString()}</td><td>${d.mauzo.toLocaleString()}</td><td>${d.mhasibu.toLocaleString()}</td><td>${d.matumizi_jina}</td><td>${d.matumizi_gharama.toLocaleString()}</td><td style="font-weight:bold;color:${d.faida>=0?'green':'red'}">${d.faida.toLocaleString()}</td><td>${delBtn}</td></tr>`;
        });
        tbody.innerHTML = html;
    };
    draw('table-maziwa', db.maziwa, 'm', 'maziwa');
    draw('table-saloon', db.saloon, 's', 'saloon');
    draw('table-mgahawa', db.mgahawa, 'mg', 'mgahawa');
    draw('table-duka', db.duka, 'mg', 'duka');
}

// ===== BURSAR / ACCOUNTANT LOGIC SYSTEM =====
let cachedBalances = { maziwa: 0, saloon: 0, mgahawa: 0, duka: 0, total: 0 };

function calculateAccountantBalances() {
    ['maziwa', 'saloon', 'mgahawa', 'duka'].forEach(section => {
        let confirmedIncome = db[section]
            .filter(d => d.status_mhasibu === 'approved')
            .reduce((total, item) => total + (item.mhasibu || 0), 0);

        if (section === 'maziwa') {
            confirmedIncome += maziwaMalipoWateja.reduce((t, p) => t + (p.kiasi || 0), 0);
        }

        let paidExpenses = requests
            .filter(r => r.idara === section && r.status === 'approved' && r.status_fedha === 'paid')
            .reduce((total, r) => total + (r.gharama || 0), 0);

        cachedBalances[section] = confirmedIncome - paidExpenses;
    });

    cachedBalances.total = cachedBalances.maziwa + cachedBalances.saloon + cachedBalances.mgahawa + cachedBalances.duka;

    const bMaziwa = document.getElementById('accBalanceMaziwa');
    const bSaloon = document.getElementById('accBalanceSaloon');
    const bMgahawa = document.getElementById('accBalanceMgahawa');
    const bDuka = document.getElementById('accBalanceDuka');
    const bTotal = document.getElementById('accTotalBalance');

    if(bMaziwa) bMaziwa.innerText = cachedBalances.maziwa.toLocaleString() + " TZS";
    if(bSaloon) bSaloon.innerText = cachedBalances.saloon.toLocaleString() + " TZS";
    if(bMgahawa) bMgahawa.innerText = cachedBalances.mgahawa.toLocaleString() + " TZS";
    if(bDuka) bDuka.innerText = cachedBalances.duka.toLocaleString() + " TZS";
    if(bTotal) bTotal.innerText = cachedBalances.total.toLocaleString() + " TZS";
}

function renderAccountantDashboard() {
    calculateAccountantBalances();

    const pendingCollectionsTable = document.getElementById('accountantPendingCollectionsTable');
    if (pendingCollectionsTable) {
        pendingCollectionsTable.innerHTML = '';
        ['maziwa', 'saloon', 'mgahawa', 'duka'].forEach(section => {
            db[section].filter(d => d.status_mhasibu === 'pending' && d.mhasibu > 0).forEach(d => {
                pendingCollectionsTable.innerHTML += `
                    <tr>
                        <td>${d.tarehe}</td>
                        <td style="text-transform:capitalize; font-weight:bold;">${section}</td>
                        <td style="color:#27ae60; font-weight:bold;">${d.mhasibu.toLocaleString()} TZS</td>
                        <td>Msimamizi: ${d.msimamizi}</td>
                        <td>
                            <button onclick="approveCollection('${section}', '${d.id}')" style="background:#27ae60; color:white; border:none; padding:5px 12px; border-radius:4px; cursor:pointer; font-weight:bold;"> Approve</button>
                        </td>
                    </tr>`;
            });
        });
    }

    const pendingExpensesTable = document.getElementById('accountantPendingExpensesTable');
    if (pendingExpensesTable) {
        pendingExpensesTable.innerHTML = '';
        requests.filter(r => r.status === 'approved' && r.status_fedha === 'unpaid').forEach(r => {
            pendingExpensesTable.innerHTML += `
                <tr>
                    <td>${r.tarehe}</td>
                    <td style="text-transform:capitalize; font-weight:bold;">${r.idara}</td>
                    <td>${r.jina}</td>
                    <td style="color:#e74c3c; font-weight:bold;">${r.gharama.toLocaleString()} TZS</td>
                    <td style="color:#27ae60; font-weight:bold;">ACCEPTED (Head of School)</td>
                    <td>
                        <button onclick="disburseExpense('${r.id}')" style="background:#e67e22; color:white; border:none; padding:5px 12px; border-radius:4px; cursor:pointer; font-weight:bold;"> Cashout</button>
                    </td>
                </tr>`;
        });
    }
}

function approveCollection(section, id) {
    firestore.collection(section).doc(id).update({ status_mhasibu: 'approved' })
    .then(() => alert("Mapato yamethibitishwa na kuingizwa kwenye salio la mradi!"))
    .catch(e => alert("Kosa: " + e.message));
}

function disburseExpense(id) {
    let req = requests.find(r => r.id === id);
    if (!req) return;

    if (cachedBalances[req.idara] < req.gharama) {
        alert(`❌ Salio la mradi wa ${req.idara.toUpperCase()} halitoshi kutoa TZS ${req.gharama.toLocaleString()}!`);
        return;
    }

    firestore.collection('requests').doc(id).update({ status_fedha: 'paid' })
    .then(() => alert("Fedha imetolewa kikamilifu kwa ajili ya matumizi!"))
    .catch(e => alert("Kosa: " + e.message));
}

// ===== HELPER: FOOTER KWENYE KILA PDF =====
function addPdfFooter(doc) {
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        const pageHeight = doc.internal.pageSize.height;
        doc.setDrawColor(220);
        doc.line(14, pageHeight - 20, doc.internal.pageSize.width - 14, pageHeight - 20);
        doc.setFontSize(8);
        doc.setTextColor(120);
        doc.text("© 2026 JohnsonDev85. All rights reserved!", doc.internal.pageSize.width / 2, pageHeight - 14, { align: "center" });
        doc.text("This System is Built with love by JohnsonDev85", doc.internal.pageSize.width / 2, pageHeight - 9, { align: "center" });
        doc.text("Email: jyona0607@gmail.com", doc.internal.pageSize.width / 2, pageHeight - 4, { align: "center" });
    }
}

// ===== PDF: FINANCIAL STATEMENT (Bursar/HoS) =====
function printFinancialStatement() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(16);
    doc.setTextColor(27, 58, 63);
    doc.text("KIDEGEMBYE SECONDARY SCHOOL", 105, 18, { align: "center" });
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text("RIPOTI YA  KIFEDHA YA MIRADI (FINANCIAL STATEMENT)", 105, 25, { align: "center" });
    doc.setFontSize(9);
    doc.setTextColor(80);
    doc.text(`Tarehe ya Ripoti: ${new Date().toLocaleDateString('en-GB')}`, 195, 33, { align: "right" });

    doc.autoTable({
        startY: 40,
        head: [["Jina la Mradi / Section", "Hali ya Salio la Sasa (TZS)"]],
        body: [
            ["Mradi wa Maziwa", cachedBalances.maziwa.toLocaleString() + " TZS"],
            ["Mradi wa Saloon", cachedBalances.saloon.toLocaleString() + " TZS"],
            ["Mradi wa Mgahawa", cachedBalances.mgahawa.toLocaleString() + " TZS"],
            ["Mradi wa Duka", cachedBalances.duka.toLocaleString() + " TZS"]
        ],
        foot: [["JUMLA KUU (TOTAL BALANCE)", cachedBalances.total.toLocaleString() + " TZS"]],
        theme: 'grid',
        headStyles: { fillColor: [31, 64, 104] },
        footStyles: { fillColor: [234, 237, 237], textColor: [39, 174, 96], fontStyle: 'bold' }
    });

    let finalY = doc.lastAutoTable.finalY + 30;
    doc.setFontSize(10);
    doc.setTextColor(50);
    doc.text("Mhasibu: ____________________", 20, finalY);
    doc.text("Head of School: ____________________", 120, finalY);

    addPdfFooter(doc);

    doc.save(`Financial-Statement-${new Date().toISOString().split('T')[0]}.pdf`);
}

// ===== Generic period filter =====
function filterByPeriod(arr, period, dateField = 'tarehe') {
    const sasa = new Date();
    const leoStr = sasa.toISOString().split('T')[0];

    return arr.filter(item => {
        const tarehe = item[dateField];
        if (!tarehe) return false;

        if (period === 'day') {
            return tarehe === leoStr;
        }

        if (period === 'week') {
            let itemDate = new Date(tarehe);
            let leoDate = new Date(leoStr);
            let mwanzoWiki = new Date(leoDate);
            mwanzoWiki.setDate(leoDate.getDate() - (leoDate.getDay() === 0 ? 6 : leoDate.getDay() - 1));
            mwanzoWiki.setHours(0,0,0,0);
            let mwishoWiki = new Date(mwanzoWiki);
            mwishoWiki.setDate(mwanzoWiki.getDate() + 6);
            mwishoWiki.setHours(23,59,59,999);
            return itemDate >= mwanzoWiki && itemDate <= mwishoWiki;
        }

        if (period === 'month') {
            return tarehe.substring(0, 7) === leoStr.substring(0, 7);
        }
        return true;
    });
}

// ===== SUMMARY =====
function calculateAdminSummary() {
    const sections = ['maziwa', 'saloon', 'mgahawa', 'duka'];

    const update = (id, val) => {
        const el = document.getElementById(id);
        if(!el) return;
        el.innerText = val.toLocaleString() + " TZS";
        el.style.color = val >= 0 ? '#16a085' : '#e74c3c';
    };

    sections.forEach(section => {
        const salesInPeriod = filterByPeriod(db[section], currentPeriod);
        const salesIncome = salesInPeriod.reduce((t, o) => t + (o.faida || 0), 0);

        const expensesInPeriod = filterByPeriod(
            requests.filter(r => r.idara === section && r.status === 'approved'),
            currentPeriod
        );
        const totalExpenses = expensesInPeriod.reduce((t, r) => t + (r.gharama || 0), 0);

        update(`profit-${section}`, salesIncome - totalExpenses);
    });
}

// ===== HEAD OF SCHOOL DASHBOARD LOGIC (SASA KWA SIKU, SI KWA WIKI) =====
function calculateHosDailyDashboard() {
    let totalSalesShule = 0;
    let totalProfitShule = 0;
    let tbody = document.getElementById('table-hos-weekly-summary');
    if(!tbody) return;
    tbody.innerHTML = '';

    const miradi = ['maziwa', 'saloon', 'mgahawa', 'duka'];

    miradi.forEach(section => {
        let dataLeo = filterByPeriod(db[section], 'day');

        let mauzo = dataLeo.reduce((t, o) => {
            return t + (o.pesa || o.mauzo || o.jumla_mauzo || 0);
        }, 0);

        let expensesLeo = filterByPeriod(
            requests.filter(r => r.idara === section && r.status === 'approved'),
            'day'
        );
        let matumizi = expensesLeo.reduce((t, r) => t + (r.gharama || 0), 0);

        let faidaMauzo = dataLeo.reduce((t, o) => t + (o.faida || 0), 0);
        let faida = faidaMauzo - matumizi;

        totalSalesShule += mauzo;
        totalProfitShule += faida;

        tbody.innerHTML += `
            <tr>
                <td style="text-transform:capitalize; font-weight:bold;">${section}</td>
                <td>${mauzo.toLocaleString()} TZS</td>
                <td>${matumizi.toLocaleString()} TZS</td>
                <td style="font-weight:bold; color:${faida >= 0 ? 'green' : 'red'}">${faida.toLocaleString()} TZS</td>
            </tr>
        `;
    });

    document.getElementById('hos-total-sales').innerText = totalSalesShule.toLocaleString() + " TZS";
    document.getElementById('hos-total-profit').innerText = totalProfitShule.toLocaleString() + " TZS";
}

// ===== HOS COMMENT SYSTEM =====
function sendHosComment(e) {
    e.preventDefault();
    const idara = document.getElementById('comment-idara').value;
    const ujumbe = document.getElementById('comment-text').value;

    const newComment = {
        idara: idara,
        ujumbe: ujumbe,
        reply: "",
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    };

    firestore.collection('comments').add(newComment).then(() => {
        alert(" Maagizo yametumwa kikamilifu!");
        document.getElementById('hosCommentForm').reset();
    }).catch(e => alert("Error: " + e.message));
}

// ===== SUPERVISOR NEWS POPUP REPLY =====
function submitNewsReply() {
    const jibu = document.getElementById('popupReply').value;
    const commentId = window.currentActiveCommentId;

    if (!jibu) {
        alert("Tafadhali andika majibu kwanza!");
        return;
    }

    if (commentId) {
        firestore.collection('comments').doc(commentId).update({
            reply: jibu
        }).then(() => {
            alert("✅ Sent successifully!");
            document.getElementById('newsPopup').style.display = 'none';
            document.getElementById('popupReply').value = '';
        }).catch(e => alert("Error: " + e.message));
    }
}

// ===== NOTIFICATIONS SYSTEM =====
function showToast(message) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.style.cssText = "background:#1b3a3f; color:white; padding:14px 18px; border-radius:8px; box-shadow:0 8px 20px rgba(0,0,0,0.3); border-left:5px solid #e67e22; max-width:320px; font-size:13px; line-height:1.4;";
    toast.innerText = message;
    container.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 6000);
}

function addNotification(message) {
    notifications.unshift({ message, time: new Date(), read: false });
    if (notifications.length > 30) notifications.pop();
    updateNotifBadge();
    renderNotifPanel();
    showToast(message);
}

function updateNotifBadge() {
    const badge = document.getElementById('notifBadge');
    if (!badge) return;
    const unread = notifications.filter(n => !n.read).length;
    if (unread > 0) {
        badge.style.display = 'flex';
        badge.innerText = unread > 9 ? '9+' : unread;
    } else {
        badge.style.display = 'none';
    }
}

function toggleNotifPanel() {
    const panel = document.getElementById('notifPanel');
    if (!panel) return;
    const isOpen = panel.style.display === 'block';
    panel.style.display = isOpen ? 'none' : 'block';
    if (!isOpen) {
        notifications.forEach(n => n.read = true);
        updateNotifBadge();
    }
}

function renderNotifPanel() {
    const list = document.getElementById('notifList');
    if (!list) return;
    if (notifications.length === 0) {
        list.innerHTML = `<p style="padding:15px; text-align:center; color:#999; font-size:13px;">No any data.</p>`;
        return;
    }
    list.innerHTML = notifications.map(n => `
        <div style="padding:10px 12px; border-bottom:1px solid #f0f0f0; font-size:12.5px; color:#333; ${n.read ? '' : 'background:#fff8f0;'}">
            <div>${n.message}</div>
            <div style="font-size:11px; color:#999; margin-top:3px;">${n.time.toLocaleTimeString('sw-TZ', {hour:'2-digit', minute:'2-digit'})}</div>
        </div>
    `).join('');
}

function clearNotifications() {
    notifications = [];
    updateNotifBadge();
    renderNotifPanel();
}

function updateNotifBellVisibility() {
    const wrapper = document.getElementById('notifBellWrapper');
    if (!wrapper) return;
    wrapper.style.display = (currentRole === 'hos' || currentRole === 'accountant') ? 'block' : 'none';
}

// ===== HOSTEL: HELPERS ZA MADENI =====
function getHostelDeficiencies(d) {
    return {
        ada_hostel: (d.ada_hostel || 0) - HOSTEL_REQUIRED.ada_hostel,
        ada_taaluma: (d.ada_taaluma || 0) - HOSTEL_REQUIRED.ada_taaluma,
        mahindi: (d.mahindi || 0) - HOSTEL_REQUIRED.mahindi,
        maharage: (d.maharage || 0) - HOSTEL_REQUIRED.maharage,
        mchele: (d.mchele || 0) - HOSTEL_REQUIRED.mchele
    };
}

function hasHostelDeficiency(d) {
    const def = getHostelDeficiencies(d);
    return def.ada_hostel < 0 || def.ada_taaluma < 0 || def.mahindi < 0 || def.maharage < 0 || def.mchele < 0;
}

function hasTaalumaDeficiency(d) {
    return ((d.ada_taaluma || 0) - HOSTEL_REQUIRED.ada_taaluma) < 0;
}

function hasMichangoDeficiency(d) {
    const def = getHostelDeficiencies(d);
    return def.ada_hostel < 0 || def.mahindi < 0 || def.maharage < 0 || def.mchele < 0;
}

function formatCellWithDeni(paid, required, isMoney) {
    paid = paid || 0;
    const deni = paid - required;
    const paidStr = isMoney ? paid.toLocaleString() : String(paid);
    const deniStr = deni < 0 ? (isMoney ? deni.toLocaleString() : String(deni)) : '0';
    return `${paidStr} (${deniStr})`;
}

// Rangi nyekundu kwenye jsPDF autotable kwa namba hasi (madeni)
function hostelDeniCellStyler(data) {
    if (data.section === 'body') {
        const raw = String(data.cell.raw);
        if (raw.includes('(-') || /^-/.test(raw.trim())) {
            data.cell.styles.textColor = [192, 57, 43];
            data.cell.styles.fontStyle = 'bold';
        }
    }
}

// ===== HOSTEL: MSIMAMIZI WA BWENI (jina linawekwa/linabadilishwa na HOS pekee) =====
function loadHostelInfo() {
    const isSet = !!(hostelInfo.msimamizi && hostelInfo.msimamizi !== "Not-found" && hostelInfo.msimamizi.trim() !== "");

    const displayName = document.getElementById('hostelSupervisorDisplayName');
    const warning = document.getElementById('hostelSupervisorNotSetWarning');
    if (displayName) {
        displayName.innerText = isSet ? hostelInfo.msimamizi : "Not-Added by HoS";
        displayName.style.color = isSet ? '#047857' : '#b91c1c';
    }
    if (warning) warning.style.display = isSet ? 'none' : 'block';

    toggleHostelFormsAvailability(isSet);

    // Prefill HOS's own input field (bila kuathiri kama HOS anaandika sasa hivi)
    const hosInput = document.getElementById('hos-hostel-supervisor-name');
    if (hosInput && document.activeElement !== hosInput) {
        hosInput.value = isSet ? hostelInfo.msimamizi : "";
    }
}

function toggleHostelFormsAvailability(isSet) {
    const typeSelect = document.getElementById('hostelTypeSelect');
    const studentForm = document.getElementById('form-hostel-student');
    const matumiziForm = document.getElementById('form-hostel-matumizi');
    const debtorsBtn = document.getElementById('hostelDebtorsBtn');
    const debtorsExcelBtn = document.getElementById('hostelDebtorsExcelBtn');

    if (typeSelect) typeSelect.disabled = !isSet;
    if (debtorsBtn) debtorsBtn.disabled = !isSet;
    if (debtorsExcelBtn) debtorsExcelBtn.disabled = !isSet;

    [studentForm, matumiziForm].forEach(form => {
        if (!form) return;
        form.querySelectorAll('input, select, button').forEach(el => { el.disabled = !isSet; });
    });
}

function hosSaveHostelSupervisorName(e) {
    e.preventDefault();
    const jina = document.getElementById('hos-hostel-supervisor-name').value.trim();
    if (!jina) { alert("Tafadhali andika jina la msimamizi!"); return; }
    firestore.collection('settings').doc('hostelInfo').set({ msimamizi: jina })
      .then(() => alert("✅ Jina la Msimamizi wa Hostel Added!"))
      .catch(e => alert("Kosa: " + e.message));
}

function toggleHostelForm() {
    const type = document.getElementById('hostelTypeSelect').value;
    document.getElementById('form-hostel-student').classList.remove('active');
    document.getElementById('form-hostel-matumizi').classList.remove('active');
    const mashineForm = document.getElementById('form-hostel-mashine');
    if (mashineForm) mashineForm.classList.remove('active');

    if (type === 'matumizi') {
        document.getElementById('form-hostel-matumizi').classList.add('active');
    } else if (type === 'mashine') {
        if (mashineForm) mashineForm.classList.add('active');
    } else {
        document.getElementById('form-hostel-student').classList.add('active');
    }
}

// ===== HOSTEL: ORODHA YA WANAFUNZI (kwa dropdown) =====

// Inaonyesha/inasimamia orodha ya majina ya wanafunzi kwa kila darasa (HoS panel)
function renderWanafunziOrodhaManage() {
    const container = document.getElementById('wanafunziOrodhaContainer');
    if (!container) return;

    let html = '';
    DARASA_ORDER.forEach(darasa => {
        const list = wanafunziOrodha.filter(w => w.darasa === darasa);
        html += `<div style="margin-top:15px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <strong style="color:#8e44ad;">${darasa} (${list.length})</strong>
                ${list.length > 0 ? `<button onclick="clearWanafunziOrodhaKwaDarasa('${darasa}')" style="background:#e74c3c;color:white;border:none;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:11px;">Futa Wote wa ${darasa}</button>` : ''}
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:8px;">
                ${list.length > 0
                    ? list.map(w => `<span style="background:#f3e8ff; padding:5px 10px; border-radius:14px; font-size:0.8rem; display:inline-flex; align-items:center; gap:6px;">${w.jina} <button onclick="deleteWanafunziOrodha('${w.id}')" style="border:none;background:none;color:#e74c3c;cursor:pointer;font-weight:bold;">✕</button></span>`).join('')
                    : `<span style="color:#999; font-size:0.85rem;">Hakuna</span>`}
            </div>
        </div>`;
    });
    container.innerHTML = html;
}

// Kusoma faili la Excel na kuongeza majina Firestore (haziandiki tena jina lililopo)
function uploadWanafunziExcel() {
    const darasa = document.getElementById('uploadDarasaSelect').value;
    const fileInput = document.getElementById('uploadExcelFile');
    const file = fileInput.files[0];
    const statusEl = document.getElementById('uploadStatusMsg');

    if (!file) { alert("Chagua faili la Excel kwanza!"); return; }
    if (typeof XLSX === 'undefined') {
        statusEl.innerText = "❌ Excel reader haijapakia vizuri, jaribu kurefresh.";
        return;
    }

    statusEl.style.color = '#333';
    statusEl.innerText = "Inasoma faili...";

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

            // Chukua majina kwenye safu (column) ya kwanza, ruka mistari mitupu na header inayowezekana
            let majina = [];
            rows.forEach(row => {
                const val = row[0];
                if (val === undefined || val === null) return;
                const jina = String(val).trim();
                if (!jina) return;
                if (jina.toLowerCase().includes('jina') || jina.toLowerCase() === 'name') return;
                majina.push(jina);
            });

            if (majina.length === 0) {
                statusEl.style.color = '#c0392b';
                statusEl.innerText = "❌ Hakuna majina yaliyopatikana kwenye file. Hakikisha majina yapo column ya kwanza.";
                return;
            }

            // Epuka kurudia majina yaliyokwisha kuwepo kwa darasa hili
            const existingNames = wanafunziOrodha.filter(w => w.darasa === darasa).map(w => w.jina.trim().toLowerCase());
            const majinaMapya = majina.filter(jina => !existingNames.includes(jina.toLowerCase()));

            if (majinaMapya.length === 0) {
                statusEl.style.color = '#e67e22';
                statusEl.innerText = "Majina yote kwenye file tayari yapo kwenye orodha ya " + darasa + " (hakuna kilichoongezwa).";
                return;
            }

            const batch = firestore.batch();
            majinaMapya.forEach(jina => {
                const ref = firestore.collection('wanafunzi_orodha').doc();
                batch.set(ref, { jina: jina, darasa: darasa });
            });

            batch.commit().then(() => {
                statusEl.style.color = '#27ae60';
                statusEl.innerText = `✅ Wanafunzi ${majinaMapya.length} wameongezwa kwa ${darasa}!`;
                fileInput.value = '';
            }).catch(err => {
                statusEl.style.color = '#c0392b';
                statusEl.innerText = "❌ Error: " + err.message;
            });

        } catch (err) {
            statusEl.style.color = '#c0392b';
            statusEl.innerText = "❌ Error: " + err.message;
        }
    };
    reader.readAsArrayBuffer(file);
}

function deleteWanafunziOrodha(id) {
    if (confirm("Una uhakika unataka kufuta jina hili kwenye orodha? (Hii haitofuti rekodi za malipo, ni orodha tu ya majina)")) {
        firestore.collection('wanafunzi_orodha').doc(id).delete()
          .catch(e => alert("Kosa: " + e.message));
    }
}

function clearWanafunziOrodhaKwaDarasa(darasa) {
    if (!confirm(`Una uhakika unataka kufuta WANAFUNZI WOTE wa ${darasa} kwenye orodha? Hii haitafuta rekodi za malipo, ni orodha tu ya majina kwa ajili ya dropdown.`)) return;
    const toDelete = wanafunziOrodha.filter(w => w.darasa === darasa);
    if (toDelete.length === 0) return;
    const batch = firestore.batch();
    toDelete.forEach(w => batch.delete(firestore.collection('wanafunzi_orodha').doc(w.id)));
    batch.commit().catch(e => alert("Kosa: " + e.message));
}

// Inajaza dropdown ya jina la mwanafunzi kutegemeana na darasa lililochaguliwa
function populateStudentDropdown() {
    const darasaSelect = document.getElementById('hostel-darasa');
    const select = document.getElementById('hostel-jina-mwanafunzi-select');
    if (!darasaSelect || !select) return;

    const darasa = darasaSelect.value;
    const list = wanafunziOrodha.filter(w => w.darasa === darasa).sort((a, b) => a.jina.localeCompare(b.jina));

    select.innerHTML = `<option value="">-- Chagua Mwanafunzi --</option>` +
        list.map(w => `<option value="${w.id}">${w.jina}</option>`).join('') +
        `<option value="__OTHER__"> Jina Halipo - Andika Mwenyewe</option>`;

    const manualWrapper = document.getElementById('hostel-jina-manual-wrapper');
    const manualInput = document.getElementById('hostel-jina-manual');
    if (manualWrapper) manualWrapper.style.display = 'none';
    if (manualInput) manualInput.value = '';

    const historyContainer = document.getElementById('studentHistoryContainer');
    if (historyContainer) historyContainer.style.display = 'none';
}

// Inaitwa mwanafunzi anapochaguliwa kwenye dropdown - inaonyesha historia ya malipo yake
function onHostelStudentSelected() {
    const select = document.getElementById('hostel-jina-mwanafunzi-select');
    const manualWrapper = document.getElementById('hostel-jina-manual-wrapper');
    const historyContainer = document.getElementById('studentHistoryContainer');
    if (!select || !manualWrapper || !historyContainer) return;

    if (select.value === '__OTHER__') {
        manualWrapper.style.display = 'block';
        historyContainer.style.display = 'none';
        return;
    }
    manualWrapper.style.display = 'none';

    if (!select.value) {
        historyContainer.style.display = 'none';
        return;
    }

    const jina = select.options[select.selectedIndex].text;
    const pastRecords = hostelMalipo
        .filter(d => d.jina_mwanafunzi === jina)
        .sort((a, b) => (b.tarehe || '').localeCompare(a.tarehe || ''));

    historyContainer.style.display = 'block';

    if (pastRecords.length === 0) {
        historyContainer.innerHTML = `<p style="color:#999; font-size:0.85rem; margin:0;">Hakuna historia ya malipo ya awali kwa ${jina}. Huyu ni mwanafunzi mpya kwenye rekodi za Hostel.</p>`;
        return;
    }

    historyContainer.innerHTML =
        `<h4 style="color:#333; font-size:0.9rem; margin-bottom:8px;">Historia ya Malipo - ${jina}</h4>` +
        buildCategoryCard('🎓 Taaluma', '#8e44ad',
            ['Muhula', 'Ada Taaluma', 'Rimu', 'Tarehe', 'Status', 'Action'],
            pastRecords.map(d => `<tr>
                <td>${d.muhula || '-'}</td>
                <td>${(d.ada_taaluma || 0).toLocaleString()}</td>
                <td>${d.njia_malipo || '-'}</td>
                <td>${d.tarehe || '-'}</td>
                <td style="color:${d.status_mhasibu === 'approved' ? 'green' : 'orange'}; font-weight:bold;">${d.status_mhasibu === 'approved' ? 'Approved' : 'Pending'}</td>
                <td><button onclick="editHostelStudent('${d.id}')" style="background:#f39c12;color:white;border:none;padding:3px 8px;border-radius:4px;cursor:pointer;font-size:11px;">✏️ Edit</button></td>
            </tr>`).join('')
        ) +
        buildCategoryCard('💰 Michango Mingine', '#0f766e',
            ['Muhula', 'Ada Hostel', 'Mahindi', 'Maharage', 'Mchele', 'Rimu', 'Tarehe', 'Status', 'Action'],
            pastRecords.map(d => `<tr>
                <td>${d.muhula || '-'}</td>
                <td>${(d.ada_hostel || 0).toLocaleString()}</td>
                <td>${d.mahindi || 0}</td>
                <td>${d.maharage || 0}</td>
                <td>${d.mchele || 0}</td>
                <td>${d.njia_malipo || '-'}</td>
                <td>${d.tarehe || '-'}</td>
                <td style="color:${d.status_mhasibu === 'approved' ? 'green' : 'orange'}; font-weight:bold;">${d.status_mhasibu === 'approved' ? 'Approved' : 'Pending'}</td>
                <td><button onclick="editHostelStudent('${d.id}')" style="background:#f39c12;color:white;border:none;padding:3px 8px;border-radius:4px;cursor:pointer;font-size:11px;">✏️ Edit</button></td>
            </tr>`).join('')
        );
}

// ===== RIMU: Cash au Entity =====
function toggleRimuEntityInput() {
    const aina = document.getElementById('hostel-rimu-aina').value;
    const wrapper = document.getElementById('hostel-rimu-namba-wrapper');
    if (!wrapper) return;
    wrapper.style.display = aina === 'Entity' ? 'block' : 'none';
}

function saveHostelStudent(e) {
    e.preventDefault();

    const select = document.getElementById('hostel-jina-mwanafunzi-select');
    const darasaValue = document.getElementById('hostel-darasa').value;
    let jina = '';
    let isManualNewName = false;

    if (select.value === '__OTHER__') {
        jina = document.getElementById('hostel-jina-manual').value.trim();
        if (!jina) { alert("Tafadhali andika jina la mwanafunzi!"); return; }
        isManualNewName = true;
    } else if (select.value) {
        jina = select.options[select.selectedIndex].text;
    } else {
        alert("Tafadhali chagua mwanafunzi kwenye dropdown, au chagua 'Andika Mwenyewe'!");
        return;
    }

    // Iwapo jina limeandikwa mwenyewe na halipo kwenye orodha ya darasa hili,
    // liongeze kwenye 'wanafunzi_orodha' ili lionekane kwenye dropdown (A-Z) mara zijazo.
    if (isManualNewName) {
        const tayaripo = wanafunziOrodha.some(w => w.darasa === darasaValue && w.jina.trim().toLowerCase() === jina.toLowerCase());
        if (!tayaripo) {
            firestore.collection('wanafunzi_orodha').add({ jina: jina, darasa: darasaValue })
              .catch(e => console.error("Error kwenye orodha ya wanafunzi:", e.message));
        }
    }

    const rimuAina = document.getElementById('hostel-rimu-aina').value;
    const rimuNamba = document.getElementById('hostel-rimu-namba').value.trim();
    const njiaDisplay = rimuAina === 'Entity' ? `Entity #${rimuNamba || '-'}` : 'Cash';

    const record = {
        jina_mwanafunzi: jina,
        darasa: darasaValue,
        muhula: document.getElementById('hostel-muhula').value,
        tarehe: document.getElementById('hostel-tarehe').value,
        msimamizi: hostelInfo.msimamizi || "Not found",
        rimu_aina: rimuAina,
        rimu_namba: rimuAina === 'Entity' ? rimuNamba : '',
        njia_malipo: njiaDisplay,
        ada_hostel: parseFloat(document.getElementById('hostel-ada-hostel').value) || 0,
        ada_taaluma: parseFloat(document.getElementById('hostel-ada-taaluma').value) || 0,
        mahindi: parseFloat(document.getElementById('hostel-mahindi').value) || 0,
        maharage: parseFloat(document.getElementById('hostel-maharage').value) || 0,
        mchele: parseFloat(document.getElementById('hostel-mchele').value) || 0,
        status_mhasibu: 'pending' // ikihaririwa, inasubiri approval upya kwa Mhasibu
    };

    if (editingHostelMalipoId) {
        const idToUpdate = editingHostelMalipoId;
        firestore.collection('hostel_malipo').doc(idToUpdate).update(record)
          .then(() => {
              alert("✅ Malipo yamesasishwa (updated) kikamilifu! Yanasubiri approval mpya ya Mhasibu.");
              cancelEditHostelStudent();
              hostelSaveAndRefresh('form-hostel-student');
          })
          .catch(e => alert("Kosa: " + e.message));
    } else {
        firestore.collection('hostel_malipo').add(record)
          .then(() => hostelSaveAndRefresh('form-hostel-student'))
          .catch(e => alert("Kosa: " + e.message));
    }
}

// Inafungua fomu ya "Add Student" ikiwa imejazwa taarifa za rekodi iliyopo, kwa ajili ya kuhariri
function editHostelStudent(id) {
    const record = hostelMalipo.find(d => d.id === id);
    if (!record) { alert("Rekodi haikupatikana."); return; }

    editingHostelMalipoId = id;

    // Hakikisha tuko kwenye fomu sahihi (Add Student), si Mashine/Matumizi
    document.getElementById('hostelTypeSelect').value = 'malipo';
    toggleHostelForm();

    document.getElementById('hostel-darasa').value = record.darasa;
    populateStudentDropdown();

    const select = document.getElementById('hostel-jina-mwanafunzi-select');
    let matched = false;
    for (let i = 0; i < select.options.length; i++) {
        if (select.options[i].text === record.jina_mwanafunzi) {
            select.value = select.options[i].value;
            matched = true;
            break;
        }
    }
    const manualWrapper = document.getElementById('hostel-jina-manual-wrapper');
    if (!matched) {
        select.value = '__OTHER__';
        if (manualWrapper) manualWrapper.style.display = 'block';
        document.getElementById('hostel-jina-manual').value = record.jina_mwanafunzi;
    } else if (manualWrapper) {
        manualWrapper.style.display = 'none';
    }

    document.getElementById('hostel-muhula').value = record.muhula;
    document.getElementById('hostel-ada-hostel').value = record.ada_hostel || 0;
    document.getElementById('hostel-ada-taaluma').value = record.ada_taaluma || 0;
    document.getElementById('hostel-mahindi').value = record.mahindi || 0;
    document.getElementById('hostel-maharage').value = record.maharage || 0;
    document.getElementById('hostel-mchele').value = record.mchele || 0;
    document.getElementById('hostel-tarehe').value = record.tarehe;

    const rimuAina = record.rimu_aina || (record.njia_malipo && record.njia_malipo !== 'Cash' && record.njia_malipo !== 'Fedha Taslimu' ? 'Entity' : 'Cash');
    document.getElementById('hostel-rimu-aina').value = rimuAina;
    toggleRimuEntityInput();
    document.getElementById('hostel-rimu-namba').value = record.rimu_namba || '';

    document.getElementById('studentHistoryContainer').style.display = 'none';

    const titleEl = document.getElementById('hostelStudentFormTitle');
    const submitBtn = document.getElementById('hostelStudentSubmitBtn');
    const cancelBtn = document.getElementById('hostelStudentCancelEditBtn');
    if (titleEl) titleEl.innerText = `✏️ Hariri Malipo ya ${record.jina_mwanafunzi}`;
    if (submitBtn) submitBtn.innerText = 'Update Malipo';
    if (cancelBtn) cancelBtn.style.display = 'inline-block';

    const formEl = document.getElementById('form-hostel-student');
    if (formEl) formEl.scrollIntoView({ behavior: 'smooth' });
}

function cancelEditHostelStudent() {
    editingHostelMalipoId = null;
    const formEl = document.getElementById('form-hostel-student');
    if (formEl) formEl.reset();
    populateStudentDropdown();
    toggleRimuEntityInput();

    const titleEl = document.getElementById('hostelStudentFormTitle');
    const submitBtn = document.getElementById('hostelStudentSubmitBtn');
    const cancelBtn = document.getElementById('hostelStudentCancelEditBtn');
    if (titleEl) titleEl.innerText = 'Add student Aliyelipa Ada ya Hostel';
    if (submitBtn) submitBtn.innerText = 'Add Student';
    if (cancelBtn) cancelBtn.style.display = 'none';
}

function submitHostelExpense(e) {
    e.preventDefault();
    const record = {
        tarehe: document.getElementById('hostel-exp-t').value,
        muhula: document.getElementById('hostel-exp-muhula').value,
        msimamizi: hostelInfo.msimamizi || "Not found",
        jina: document.getElementById('hostel-exp-jina').value,
        gharama: parseFloat(document.getElementById('hostel-exp-gharama').value) || 0,
        status: 'pending',
        status_fedha: 'unpaid'
    };
    firestore.collection('hostel_matumizi').add(record)
      .then(() => hostelSaveAndRefresh('form-hostel-matumizi'))
      .catch(e => alert("Kosa: " + e.message));
}

function hostelSaveAndRefresh(formId) {
    document.getElementById(formId).reset();
    loadHostelInfo();
    if (formId === 'form-hostel-student') {
        populateStudentDropdown();
        toggleRimuEntityInput();
    }
    if (formId === 'form-hostel-mashine') {
        const preview = document.getElementById('mashine-jumla-preview');
        if (preview) preview.value = '0';
    }
    const alertBox = document.getElementById('hostelSuccessAlert');
    if (alertBox) {
        alertBox.style.display = 'block';
        setTimeout(() => { alertBox.style.display = 'none'; }, 3000);
    }
}

// Inatoa card moja ya HTML kwa jedwali fulani (kutumika kwa Taaluma/Michango Mingine)
function buildCategoryCard(title, borderColor, headers, rows) {
    return `<div style="margin-top:15px; background:#fff; border-left:5px solid ${borderColor}; border-radius:6px; box-shadow:0 2px 5px rgba(0,0,0,0.05); padding:15px;">
        <h4 style="color:${borderColor}; margin-bottom:10px;">${title}</h4>
        <div class="data-table-container" style="margin-top:0;">
            <table>
                <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    </div>`;
}

function renderHostelStudentsList() {
    const container = document.getElementById('hostelStudentsListContainer');
    if (!container) return;

    if (hostelMalipo.length === 0) {
        container.innerHTML = `<p style="color:#999; text-align:center; padding:15px;">No any student.</p>`;
        return;
    }

    let html = '';
    DARASA_ORDER.forEach(darasa => {
        const wanafunzi = hostelMalipo.filter(d => d.darasa === darasa);
        if (wanafunzi.length === 0) return;

        html += `<h4 style="color:#059669; margin-top:20px;">${darasa} (${wanafunzi.length})</h4>`;

        const taalumaRows = wanafunzi.map(d => `
            <tr>
                <td>${d.jina_mwanafunzi}</td>
                <td>${d.muhula}</td>
                <td>${(d.ada_taaluma||0).toLocaleString()}</td>
                <td>${d.njia_malipo || '-'}</td>
                <td>${d.tarehe}</td>
                <td style="color:${d.status_mhasibu === 'approved' ? 'green' : 'orange'}; font-weight:bold;">${d.status_mhasibu === 'approved' ? 'Approved' : 'Pending'}</td>
                <td>
                    <button onclick="editHostelStudent('${d.id}')" style="background:#f39c12;color:white;border:none;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:12px;">✏️ Edit</button>
                    <button onclick="deleteRecord('hostel_malipo','${d.id}')" style="background:#e74c3c;color:white;border:none;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:12px;">🗑</button>
                </td>
            </tr>`).join('');
        html += buildCategoryCard('🎓 Taaluma', '#8e44ad', ['Jina', 'Muhula', 'Ada Taaluma', 'Rimu', 'Tarehe', 'Status', 'Action'], taalumaRows);

        const michangoRows = wanafunzi.map(d => `
            <tr>
                <td>${d.jina_mwanafunzi}</td>
                <td>${d.muhula}</td>
                <td>${(d.ada_hostel||0).toLocaleString()}</td>
                <td>${d.mahindi||0}</td>
                <td>${d.maharage||0}</td>
                <td>${d.mchele||0}</td>
                <td>${d.njia_malipo || '-'}</td>
                <td>${d.tarehe}</td>
                <td style="color:${d.status_mhasibu === 'approved' ? 'green' : 'orange'}; font-weight:bold;">${d.status_mhasibu === 'approved' ? 'Approved' : 'Pending'}</td>
                <td>
                    <button onclick="editHostelStudent('${d.id}')" style="background:#f39c12;color:white;border:none;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:12px;">✏️ Edit</button>
                    <button onclick="deleteRecord('hostel_malipo','${d.id}')" style="background:#e74c3c;color:white;border:none;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:12px;">🗑</button>
                </td>
            </tr>`).join('');
        html += buildCategoryCard('💰 Michango Mingine (Ada Hostel + Chakula)', '#0f766e', ['Jina', 'Muhula', 'Ada Hostel', 'Mahindi', 'Maharage', 'Mchele', 'Rimu', 'Tarehe', 'Status', 'Action'], michangoRows);
    });
    container.innerHTML = html || `<p style="color:#999; text-align:center; padding:15px;">No any Student.</p>`;
}

// ===== MASHINE (PUMBA) - MSIMAMIZI WA HOSTEL =====
function updateMashineJumlaPreview() {
    const kiasi = parseFloat(document.getElementById('mashine-kiasi').value) || 0;
    const bei = parseFloat(document.getElementById('mashine-bei').value) || 0;
    document.getElementById('mashine-jumla-preview').value = (kiasi * bei).toLocaleString();
}

function saveHostelMashine(e) {
    e.preventDefault();
    const kiasi = parseFloat(document.getElementById('mashine-kiasi').value) || 0;
    const bei = parseFloat(document.getElementById('mashine-bei').value) || 0;
    const record = {
        tarehe: document.getElementById('mashine-tarehe').value,
        kiasi_pumba: kiasi,
        bei_kipimo: bei,
        jumla_mauzo: kiasi * bei,
        msimamizi: hostelInfo.msimamizi || "Not found",
        status_mhasibu: 'pending'
    };
    firestore.collection('hostel_mashine').add(record)
      .then(() => hostelSaveAndRefresh('form-hostel-mashine'))
      .catch(e => alert("Kosa: " + e.message));
}

function renderHostelMashineList() {
    const container = document.getElementById('hostelMashineListContainer');
    if (!container) return;

    if (hostelMashine.length === 0) {
        container.innerHTML = `<p style="color:#999; text-align:center; padding:15px;">No any record ya Mashine.</p>`;
        return;
    }

    const rows = hostelMashine.slice(0, 50).map(d => `
        <tr>
            <td>${d.tarehe}</td>
            <td>${d.kiasi_pumba}</td>
            <td>${(d.bei_kipimo||0).toLocaleString()}</td>
            <td>${(d.jumla_mauzo||0).toLocaleString()}</td>
            <td style="color:${d.status_mhasibu === 'approved' ? 'green' : 'orange'}; font-weight:bold;">${d.status_mhasibu === 'approved' ? 'Approved' : 'Pending'}</td>
            <td><button onclick="deleteRecord('hostel_mashine','${d.id}')" style="background:#e74c3c;color:white;border:none;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:12px;">🗑 Delete</button></td>
        </tr>`).join('');

    container.innerHTML = `<div class="data-table-container">
        <table>
            <thead><tr><th>Tarehe</th><th>Kiasi cha Pumba</th><th>Bei</th><th>Jumla Mauzo (TZS)</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>
    </div>`;
}

// ===== MASHINE - MHASIBU (Salio tofauti kabisa na Hostel) =====
function calculateMashineBalance() {
    mashineBalance = hostelMashine
        .filter(d => d.status_mhasibu === 'approved')
        .reduce((t, d) => t + (d.jumla_mauzo || 0), 0);
    return mashineBalance;
}

function renderMashineAccountantSection() {
    const balance = calculateMashineBalance();
    const balanceEl = document.getElementById('accMashineBalance');
    if (balanceEl) balanceEl.innerText = balance.toLocaleString() + " TZS";

    const pendingTable = document.getElementById('accMashinePendingTable');
    if (pendingTable) {
        pendingTable.innerHTML = '';
        hostelMashine.filter(d => d.status_mhasibu === 'pending').forEach(d => {
            pendingTable.innerHTML += `
                <tr>
                    <td>${d.tarehe}</td>
                    <td>${d.kiasi_pumba}</td>
                    <td>${(d.bei_kipimo||0).toLocaleString()}</td>
                    <td>${(d.jumla_mauzo||0).toLocaleString()}</td>
                    <td>${d.msimamizi}</td>
                    <td><button onclick="approveMashineCollection('${d.id}')" style="background:#27ae60; color:white; border:none; padding:5px 12px; border-radius:4px; cursor:pointer; font-weight:bold;">Approve</button></td>
                </tr>`;
        });
    }
}

function approveMashineCollection(id) {
    firestore.collection('hostel_mashine').doc(id).update({ status_mhasibu: 'approved' })
      .then(() => alert("Mauzo ya Mashine yamethibitishwa na kuingizwa kwenye salio lake!"))
      .catch(e => alert("Kosa: " + e.message));
}

// ===== SUPERVISOR: Data iliyochujwa kwa ajili ya Ripoti ya Wanaodaiwa =====
// Inatumika na PDF na Excel exports zote mbili, ili logic isirudiwe mara mbili.
function getFilteredDebtorsData() {
    const muhulaSelect = document.getElementById('hostelSupervisorMuhulaSelect');
    const muhula = muhulaSelect ? muhulaSelect.value : 'Muhula wa Kwanza';
    const darasaSelect = document.getElementById('hostelSupervisorDarasaSelect');
    const darasaFilter = darasaSelect ? darasaSelect.value : 'Yote';
    const typeSelect = document.getElementById('hostelDebtorsReportType');
    const reportType = typeSelect ? typeSelect.value : 'general'; // general | taaluma | michango

    let wanafunziMuhula = hostelMalipo.filter(d => d.muhula === muhula);
    if (darasaFilter !== 'Yote') {
        wanafunziMuhula = wanafunziMuhula.filter(d => d.darasa === darasaFilter);
    }

    let wanaodaiwa;
    if (reportType === 'taaluma') {
        wanaodaiwa = wanafunziMuhula.filter(hasTaalumaDeficiency);
    } else if (reportType === 'michango') {
        wanaodaiwa = wanafunziMuhula.filter(hasMichangoDeficiency);
    } else {
        wanaodaiwa = wanafunziMuhula.filter(hasHostelDeficiency);
    }

    return { muhula, darasaFilter, reportType, wanaodaiwa };
}

function reportTypeLabel(reportType) {
    if (reportType === 'taaluma') return 'TAALUMA PEKEE';
    if (reportType === 'michango') return 'MICHANGO MINGINE PEKEE';
    return 'GENERAL (TAALUMA + MICHANGO MINGINE)';
}

// ===== SUPERVISOR: PDF ya Wanaodaiwa =====
function printHostelDebtorsReport() {
    const { muhula, darasaFilter, reportType, wanaodaiwa } = getFilteredDebtorsData();

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(16);
    doc.setTextColor(5, 150, 105);
    doc.text("KIDEGEMBYE SECONDARY SCHOOL", 105, 18, { align: "center" });
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`RIPOTI YA WANAFUNZI WANAODAIWA - ${muhula.toUpperCase()} (${darasaFilter})`, 105, 25, { align: "center" });
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(`Aina ya Ripoti: ${reportTypeLabel(reportType)}`, 105, 30, { align: "center" });
    doc.setFontSize(9);
    doc.setTextColor(80);
    doc.text(`Tarehe ya Ripoti: ${new Date().toLocaleDateString('en-GB')}`, 195, 36, { align: "right" });

    let finalY;
    if (wanaodaiwa.length === 0) {
        doc.setFontSize(11);
        doc.setTextColor(50);
        doc.text("Hakuna mwanafunzi anayedaiwa kwa vigezo hivi. Wote wamelipa kikamilifu!", 14, 48);
        finalY = 58;
    } else if (reportType === 'taaluma') {
        doc.autoTable({
            startY: 42,
            head: [["Jina la Mwanafunzi", "Darasa", "Ada Taaluma - Alicholipa (Deni)"]],
            body: wanaodaiwa.map(d => [
                d.jina_mwanafunzi,
                d.darasa,
                formatCellWithDeni(d.ada_taaluma, HOSTEL_REQUIRED.ada_taaluma, true)
            ]),
            theme: 'grid',
            headStyles: { fillColor: [142, 68, 173] },
            styles: { fontSize: 9 },
            didParseCell: hostelDeniCellStyler
        });
        finalY = doc.lastAutoTable.finalY + 20;
    } else if (reportType === 'michango') {
        doc.autoTable({
            startY: 42,
            head: [["Jina la Mwanafunzi", "Darasa", "Mahindi", "Maharage", "Mchele", "Ada Hostel"]],
            body: wanaodaiwa.map(d => {
                const def = getHostelDeficiencies(d);
                return [
                    d.jina_mwanafunzi,
                    d.darasa,
                    def.mahindi < 0 ? def.mahindi : 0,
                    def.maharage < 0 ? def.maharage : 0,
                    def.mchele < 0 ? def.mchele : 0,
                    def.ada_hostel < 0 ? def.ada_hostel.toLocaleString() : "0"
                ];
            }),
            theme: 'grid',
            headStyles: { fillColor: [15, 118, 110] },
            styles: { fontSize: 9 },
            didParseCell: hostelDeniCellStyler
        });
        finalY = doc.lastAutoTable.finalY + 20;
    } else {
        doc.autoTable({
            startY: 42,
            head: [["Jina la Mwanafunzi", "Darasa", "Mahindi", "Maharage", "Mchele", "Ada Hostel", "Ada Taaluma"]],
            body: wanaodaiwa.map(d => {
                const def = getHostelDeficiencies(d);
                return [
                    d.jina_mwanafunzi,
                    d.darasa,
                    def.mahindi < 0 ? def.mahindi : 0,
                    def.maharage < 0 ? def.maharage : 0,
                    def.mchele < 0 ? def.mchele : 0,
                    def.ada_hostel < 0 ? def.ada_hostel.toLocaleString() : "0",
                    def.ada_taaluma < 0 ? def.ada_taaluma.toLocaleString() : "0"
                ];
            }),
            theme: 'grid',
            headStyles: { fillColor: [185, 28, 28] },
            styles: { fontSize: 9 },
            didParseCell: hostelDeniCellStyler
        });
        finalY = doc.lastAutoTable.finalY + 20;
    }

    if (finalY > doc.internal.pageSize.height - 30) {
        doc.addPage();
        finalY = 30;
    }
    doc.setFontSize(10);
    doc.setTextColor(50);
    doc.text("Msimamizi wa Hostel: ____________________", 14, finalY);

    addPdfFooter(doc);

    doc.save(`Wanaodaiwa-${reportType}-${muhula.replace(/\s+/g,'-')}-${darasaFilter.replace(/\s+/g,'-')}-${new Date().toISOString().split('T')[0]}.pdf`);
}

// ===== SUPERVISOR: EXCEL ya Wanaodaiwa (rahisi kuprint/kutuma kwa email) =====
function exportHostelDebtorsExcel() {
    if (typeof XLSX === 'undefined') {
        alert("❌ Excel export haijapakia vizuri, jaribu kurefresh ukurasa.");
        return;
    }

    const { muhula, darasaFilter, reportType, wanaodaiwa } = getFilteredDebtorsData();

    if (wanaodaiwa.length === 0) {
        alert("Hakuna mwanafunzi anayedaiwa kwa vigezo hivi - hakuna cha ku-export.");
        return;
    }

    let rows = [];
    if (reportType === 'taaluma') {
        rows = wanaodaiwa.map(d => ({
            "Jina la Mwanafunzi": d.jina_mwanafunzi,
            "Darasa": d.darasa,
            "Ada Taaluma Alicholipa": d.ada_taaluma || 0,
            "Ada Taaluma Inayotakiwa": HOSTEL_REQUIRED.ada_taaluma,
            "Deni la Taaluma": Math.min(0, (d.ada_taaluma || 0) - HOSTEL_REQUIRED.ada_taaluma)
        }));
    } else if (reportType === 'michango') {
        rows = wanaodaiwa.map(d => {
            const def = getHostelDeficiencies(d);
            return {
                "Jina la Mwanafunzi": d.jina_mwanafunzi,
                "Darasa": d.darasa,
                "Ada Hostel Alicholipa": d.ada_hostel || 0,
                "Deni la Ada Hostel": def.ada_hostel < 0 ? def.ada_hostel : 0,
                "Mahindi Alicholipa": d.mahindi || 0,
                "Deni la Mahindi": def.mahindi < 0 ? def.mahindi : 0,
                "Maharage Alicholipa": d.maharage || 0,
                "Deni la Maharage": def.maharage < 0 ? def.maharage : 0,
                "Mchele Alicholipa": d.mchele || 0,
                "Deni la Mchele": def.mchele < 0 ? def.mchele : 0
            };
        });
    } else {
        rows = wanaodaiwa.map(d => {
            const def = getHostelDeficiencies(d);
            return {
                "Jina la Mwanafunzi": d.jina_mwanafunzi,
                "Darasa": d.darasa,
                "Ada Hostel Alicholipa": d.ada_hostel || 0,
                "Deni la Ada Hostel": def.ada_hostel < 0 ? def.ada_hostel : 0,
                "Ada Taaluma Alicholipa": d.ada_taaluma || 0,
                "Deni la Ada Taaluma": def.ada_taaluma < 0 ? def.ada_taaluma : 0,
                "Mahindi Alicholipa": d.mahindi || 0,
                "Deni la Mahindi": def.mahindi < 0 ? def.mahindi : 0,
                "Maharage Alicholipa": d.maharage || 0,
                "Deni la Maharage": def.maharage < 0 ? def.maharage : 0,
                "Mchele Alicholipa": d.mchele || 0,
                "Deni la Mchele": def.mchele < 0 ? def.mchele : 0
            };
        });
    }

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Wanaodaiwa");
    XLSX.writeFile(workbook, `Wanaodaiwa-${reportType}-${muhula.replace(/\s+/g,'-')}-${darasaFilter.replace(/\s+/g,'-')}-${new Date().toISOString().split('T')[0]}.xlsx`);
}

// ===== HOS: TABS =====
function switchHosTab(tab) {
    const miradiSection = document.getElementById('hosMiradiSection');
    const hostelSection = document.getElementById('hosHostelSection');
    const tabMiradi = document.getElementById('hosTabMiradi');
    const tabHostel = document.getElementById('hosTabHostel');
    if (!miradiSection || !hostelSection) return;

    if (tab === 'hostel') {
        miradiSection.style.display = 'none';
        hostelSection.style.display = 'block';
        tabMiradi.classList.remove('active');
        tabHostel.classList.add('active');
        renderHostelRequests();
        renderHosHostelSummary();
        renderWanafunziOrodhaManage();
        switchHosHostelSubTab(currentHosHostelSubTab);
    } else {
        miradiSection.style.display = 'block';
        hostelSection.style.display = 'none';
        tabHostel.classList.remove('active');
        tabMiradi.classList.add('active');
        renderAdminRequests();
        renderAdminApprovedExpenses();
        calculateAdminSummary();
        calculateHosDailyDashboard();
        loadSupervisors();
    }
}

// ===== HOS: HOSTEL EXPENSE APPROVALS =====
function renderHostelRequests() {
    const pendingTbody = document.getElementById('table-hostel-pending-requests');
    const approvedTbody = document.getElementById('table-hostel-approved-requests');
    if (!pendingTbody || !approvedTbody) return;

    pendingTbody.innerHTML = '';
    hostelMatumizi.filter(r => r.status === 'pending').forEach(r => {
        pendingTbody.innerHTML += `
            <tr>
                <td>${r.tarehe}</td>
                <td>${r.msimamizi}</td>
                <td>${r.jina}</td>
                <td>${r.gharama.toLocaleString()}</td>
                <td>
                    <button class="btn-approve" onclick="approveHostelExpense('${r.id}')">Accept</button>
                    <button class="btn-reject" onclick="rejectHostelExpense('${r.id}')">Reject</button>
                    <button onclick="deleteRecord('hostel_matumizi','${r.id}')" style="background:#e74c3c;color:white;border:none;padding:6px 10px;border-radius:4px;cursor:pointer;font-size:12px;">🗑</button>
                </td>
            </tr>`;
    });

    approvedTbody.innerHTML = '';
    hostelMatumizi.filter(r => r.status === 'approved').forEach(r => {
        approvedTbody.innerHTML += `<tr><td>${r.tarehe}</td><td>${r.msimamizi}</td><td>${r.jina}</td><td>${r.gharama.toLocaleString()}</td><td><button onclick="deleteRecord('hostel_matumizi','${r.id}')" style="background:#e74c3c;color:white;border:none;padding:6px 10px;border-radius:4px;cursor:pointer;font-size:12px;">🗑 Delete</button></td></tr>`;
    });
}

function approveHostelExpense(id) {
    firestore.collection('hostel_matumizi').doc(id).update({ status: 'approved' })
      .catch(e => alert("Kosa: " + e.message));
}

function rejectHostelExpense(id) {
    firestore.collection('hostel_matumizi').doc(id).update({ status: 'rejected' })
      .catch(e => alert("Kosa: " + e.message));
}

// ===== HOS: Idadi ya wanafunzi kwa Muhula uliochaguliwa =====
function renderHosHostelSummary() {
    const muhulaSelect = document.getElementById('hosHostelMuhulaSelect');
    const countEl = document.getElementById('hosHostelStudentCount');
    if (muhulaSelect && countEl) {
        const selectedMuhula = muhulaSelect.value;
        const count = hostelMalipo.filter(d => d.muhula === selectedMuhula).length;
        countEl.innerText = count;
    }
}

// ===== HOS: SUB-TABS ZA HOSTEL (MASHINE | TAALUMA | MICHANGO MINGINE) =====
function switchHosHostelSubTab(tab) {
    currentHosHostelSubTab = tab;
    const mashineSub = document.getElementById('hosHostelMashineSubTab');
    const taalumaSub = document.getElementById('hosHostelTaalumaSubTab');
    const michangoSub = document.getElementById('hosHostelMichangoSubTab');
    const tabMashine = document.getElementById('hosHostelTabMashine');
    const tabTaaluma = document.getElementById('hosHostelTabTaaluma');
    const tabMichango = document.getElementById('hosHostelTabMichango');
    if (!mashineSub || !taalumaSub || !michangoSub) return;

    mashineSub.style.display = tab === 'mashine' ? 'block' : 'none';
    taalumaSub.style.display = tab === 'taaluma' ? 'block' : 'none';
    michangoSub.style.display = tab === 'michango' ? 'block' : 'none';

    [tabMashine, tabTaaluma, tabMichango].forEach(btn => { if (btn) btn.classList.remove('active'); });
    if (tab === 'mashine' && tabMashine) tabMashine.classList.add('active');
    if (tab === 'taaluma' && tabTaaluma) tabTaaluma.classList.add('active');
    if (tab === 'michango' && tabMichango) tabMichango.classList.add('active');

    if (tab === 'mashine') renderHosMashineSubTab();
    if (tab === 'taaluma') { renderHosHostelSummary(); renderHosTaalumaSubTab(); }
    if (tab === 'michango') renderHosMichangoSubTab();
}

function renderHosMashineSubTab() {
    const totalEl = document.getElementById('hosMashineTotalSales');
    const tbody = document.getElementById('hosMashineTable');
    if (!totalEl || !tbody) return;

    const totalApproved = hostelMashine.filter(d => d.status_mhasibu === 'approved').reduce((t, d) => t + (d.jumla_mauzo || 0), 0);
    totalEl.innerText = totalApproved.toLocaleString() + " TZS";

    tbody.innerHTML = '';
    hostelMashine.slice(0, 100).forEach(d => {
        tbody.innerHTML += `<tr>
            <td>${d.tarehe}</td>
            <td>${d.kiasi_pumba}</td>
            <td>${(d.bei_kipimo || 0).toLocaleString()}</td>
            <td>${(d.jumla_mauzo || 0).toLocaleString()}</td>
            <td>${d.msimamizi}</td>
            <td style="color:${d.status_mhasibu === 'approved' ? 'green' : 'orange'}; font-weight:bold;">${d.status_mhasibu === 'approved' ? 'Approved' : 'Pending'}</td>
        </tr>`;
    });
}

function renderHosTaalumaSubTab() {
    const container = document.getElementById('hosTaalumaListContainer');
    if (!container) return;
    if (hostelMalipo.length === 0) {
        container.innerHTML = `<p style="color:#999; text-align:center; padding:15px;">Hakuna taarifa.</p>`;
        return;
    }
    let html = '';
    DARASA_ORDER.forEach(darasa => {
        const wanafunzi = hostelMalipo.filter(d => d.darasa === darasa);
        if (wanafunzi.length === 0) return;
        const rows = wanafunzi.map(d => `<tr>
            <td>${d.jina_mwanafunzi}</td>
            <td>${d.muhula}</td>
            <td>${(d.ada_taaluma || 0).toLocaleString()}</td>
            <td>${d.njia_malipo || '-'}</td>
            <td>${d.tarehe}</td>
            <td style="color:${d.status_mhasibu === 'approved' ? 'green' : 'orange'}; font-weight:bold;">${d.status_mhasibu === 'approved' ? 'Approved' : 'Pending'}</td>
        </tr>`).join('');
        html += buildCategoryCard(`${darasa} (${wanafunzi.length})`, '#8e44ad', ['Jina', 'Muhula', 'Ada Taaluma', 'Rimu', 'Tarehe', 'Status'], rows);
    });
    container.innerHTML = html;
}

function renderHosMichangoSubTab() {
    const container = document.getElementById('hosMichangoListContainer');
    if (!container) return;
    if (hostelMalipo.length === 0) {
        container.innerHTML = `<p style="color:#999; text-align:center; padding:15px;">Hakuna taarifa.</p>`;
        return;
    }
    let html = '';
    DARASA_ORDER.forEach(darasa => {
        const wanafunzi = hostelMalipo.filter(d => d.darasa === darasa);
        if (wanafunzi.length === 0) return;
        const rows = wanafunzi.map(d => `<tr>
            <td>${d.jina_mwanafunzi}</td>
            <td>${d.muhula}</td>
            <td>${(d.ada_hostel || 0).toLocaleString()}</td>
            <td>${d.mahindi || 0}</td>
            <td>${d.maharage || 0}</td>
            <td>${d.mchele || 0}</td>
            <td>${d.njia_malipo || '-'}</td>
            <td>${d.tarehe}</td>
            <td style="color:${d.status_mhasibu === 'approved' ? 'green' : 'orange'}; font-weight:bold;">${d.status_mhasibu === 'approved' ? 'Approved' : 'Pending'}</td>
        </tr>`).join('');
        html += buildCategoryCard(`${darasa} (${wanafunzi.length})`, '#0f766e', ['Jina', 'Muhula', 'Ada Hostel', 'Mahindi', 'Maharage', 'Mchele', 'Rimu', 'Tarehe', 'Status'], rows);
    });
    container.innerHTML = html;
}

// ===== HOS: PDF - MASHINE =====
function printMashineReport() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(16);
    doc.setTextColor(3, 105, 161);
    doc.text("KIDEGEMBYE SECONDARY SCHOOL", 105, 18, { align: "center" });
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text("RIPOTI YA MASHINE (MAUZO YA PUMBA)", 105, 25, { align: "center" });
    doc.setFontSize(9);
    doc.setTextColor(80);
    doc.text(`Tarehe ya Ripoti: ${new Date().toLocaleDateString('en-GB')}`, 195, 33, { align: "right" });

    const totalApproved = hostelMashine.filter(d => d.status_mhasibu === 'approved').reduce((t, d) => t + (d.jumla_mauzo || 0), 0);

    if (hostelMashine.length === 0) {
        doc.setFontSize(11);
        doc.setTextColor(50);
        doc.text("Hakuna rekodi za Mashine bado.", 14, 45);
    } else {
        doc.autoTable({
            startY: 40,
            head: [["Tarehe", "Kiasi cha Pumba", "Bei", "Jumla Mauzo (TZS)", "Status"]],
            body: hostelMashine.map(d => [
                d.tarehe,
                d.kiasi_pumba,
                (d.bei_kipimo || 0).toLocaleString(),
                (d.jumla_mauzo || 0).toLocaleString(),
                d.status_mhasibu === 'approved' ? 'Approved' : 'Pending'
            ]),
            foot: [["", "", "JUMLA (Yaliyothibitishwa)", totalApproved.toLocaleString() + " TZS", ""]],
            theme: 'grid',
            headStyles: { fillColor: [3, 105, 161] },
            footStyles: { fillColor: [224, 242, 254], textColor: [3, 105, 161], fontStyle: 'bold' },
            styles: { fontSize: 9 }
        });
    }

    let finalY = (doc.lastAutoTable ? doc.lastAutoTable.finalY : 50) + 25;
    doc.setFontSize(10);
    doc.setTextColor(50);
    doc.text("Msimamizi wa Hostel: ____________________", 14, finalY);

    addPdfFooter(doc);
    doc.save(`Ripoti-Mashine-${new Date().toISOString().split('T')[0]}.pdf`);
}

// ===== HOS: PDF - TAALUMA =====
function printTaalumaReport() {
    const muhulaSelect = document.getElementById('hosHostelMuhulaSelect');
    const muhula = muhulaSelect ? muhulaSelect.value : 'Muhula wa Kwanza';
    const wanafunziMuhula = hostelMalipo.filter(d => d.muhula === muhula);

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(16);
    doc.setTextColor(142, 68, 173);
    doc.text("KIDEGEMBYE SECONDARY SCHOOL", 105, 18, { align: "center" });
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`RIPOTI YA TAALUMA - ${muhula.toUpperCase()}`, 105, 25, { align: "center" });
    doc.setFontSize(9);
    doc.setTextColor(80);
    doc.text(`Tarehe ya Ripoti: ${new Date().toLocaleDateString('en-GB')}`, 195, 33, { align: "right" });

    let currentY = 40;
    let ndipoKunaData = false;
    DARASA_ORDER.forEach(darasa => {
        const group = wanafunziMuhula.filter(d => d.darasa === darasa);
        if (group.length === 0) return;
        ndipoKunaData = true;

        if (currentY > doc.internal.pageSize.height - 50) {
            doc.addPage();
            currentY = 20;
        }

        doc.setFontSize(11);
        doc.setTextColor(142, 68, 173);
        doc.text(darasa, 14, currentY);

        doc.autoTable({
            startY: currentY + 3,
            head: [["Jina la Mwanafunzi", "Ada Taaluma - Alicholipa (Deni)", "Rimu", "Status"]],
            body: group.map(d => [
                d.jina_mwanafunzi,
                formatCellWithDeni(d.ada_taaluma, HOSTEL_REQUIRED.ada_taaluma, true),
                d.njia_malipo || '-',
                d.status_mhasibu === 'approved' ? 'Approved' : 'Pending'
            ]),
            theme: 'striped',
            headStyles: { fillColor: [142, 68, 173] },
            styles: { fontSize: 9 },
            didParseCell: hostelDeniCellStyler
        });

        currentY = doc.lastAutoTable.finalY + 15;
    });

    if (!ndipoKunaData) {
        doc.setFontSize(11);
        doc.setTextColor(50);
        doc.text("Hakuna taarifa za Taaluma kwa muhula huu.", 14, 45);
        currentY = 55;
    }

    if (currentY > doc.internal.pageSize.height - 30) {
        doc.addPage();
        currentY = 30;
    }
    doc.setFontSize(10);
    doc.setTextColor(50);
    doc.text("Head of School: ____________________", 14, currentY);

    addPdfFooter(doc);
    doc.save(`Taaluma-${muhula.replace(/\s+/g,'-')}-${new Date().toISOString().split('T')[0]}.pdf`);
}

// ===== HOS: PDF - MICHANGO MINGINE =====
function printMichangoMingineReport() {
    const muhulaSelect = document.getElementById('hosHostelMuhulaSelect');
    const muhula = muhulaSelect ? muhulaSelect.value : 'Muhula wa Kwanza';
    const wanafunziMuhula = hostelMalipo.filter(d => d.muhula === muhula);

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(16);
    doc.setTextColor(15, 118, 110);
    doc.text("KIDEGEMBYE SECONDARY SCHOOL", 105, 18, { align: "center" });
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`RIPOTI YA MICHANGO MINGINE - ${muhula.toUpperCase()}`, 105, 25, { align: "center" });
    doc.setFontSize(9);
    doc.setTextColor(80);
    doc.text(`Tarehe ya Ripoti: ${new Date().toLocaleDateString('en-GB')}`, 195, 33, { align: "right" });

    let currentY = 40;
    let ndipoKunaData = false;
    DARASA_ORDER.forEach(darasa => {
        const group = wanafunziMuhula.filter(d => d.darasa === darasa);
        if (group.length === 0) return;
        ndipoKunaData = true;

        if (currentY > doc.internal.pageSize.height - 50) {
            doc.addPage();
            currentY = 20;
        }

        doc.setFontSize(11);
        doc.setTextColor(15, 118, 110);
        doc.text(darasa, 14, currentY);

        doc.autoTable({
            startY: currentY + 3,
            head: [["Jina la Mwanafunzi", "Ada Hostel", "Mahindi", "Maharage", "Mchele", "Rimu", "Status"]],
            body: group.map(d => [
                d.jina_mwanafunzi,
                formatCellWithDeni(d.ada_hostel, HOSTEL_REQUIRED.ada_hostel, true),
                formatCellWithDeni(d.mahindi, HOSTEL_REQUIRED.mahindi, false),
                formatCellWithDeni(d.maharage, HOSTEL_REQUIRED.maharage, false),
                formatCellWithDeni(d.mchele, HOSTEL_REQUIRED.mchele, false),
                d.njia_malipo || '-',
                d.status_mhasibu === 'approved' ? 'Approved' : 'Pending'
            ]),
            theme: 'striped',
            headStyles: { fillColor: [15, 118, 110] },
            styles: { fontSize: 9 },
            didParseCell: hostelDeniCellStyler
        });

        currentY = doc.lastAutoTable.finalY + 15;
    });

    if (!ndipoKunaData) {
        doc.setFontSize(11);
        doc.setTextColor(50);
        doc.text("Hakuna taarifa za Michango Mingine kwa muhula huu.", 14, 45);
        currentY = 55;
    }

    if (currentY > doc.internal.pageSize.height - 30) {
        doc.addPage();
        currentY = 30;
    }
    doc.setFontSize(10);
    doc.setTextColor(50);
    doc.text("Head of School: ____________________", 14, currentY);

    addPdfFooter(doc);
    doc.save(`Michango-Mingine-${muhula.replace(/\s+/g,'-')}-${new Date().toISOString().split('T')[0]}.pdf`);
}

// ===== HOS: PDF ya Taarifa Kamili ya Hostel (Alicholipa + Deni) =====
function printHostelStatement() {
    const muhulaSelect = document.getElementById('hosHostelMuhulaSelect');
    const muhula = muhulaSelect ? muhulaSelect.value : 'Muhula wa Kwanza';

    const wanafunziMuhula = hostelMalipo.filter(d => d.muhula === muhula);
    const makusanyo = wanafunziMuhula
        .filter(d => d.status_mhasibu === 'approved')
        .reduce((t, d) => t + (d.ada_hostel || 0) + (d.ada_taaluma || 0), 0);

    const matumiziMuhula = hostelMatumizi.filter(r => r.muhula === muhula && r.status === 'approved');
    const jumlaMatumizi = matumiziMuhula
        .filter(r => r.status_fedha === 'paid')
        .reduce((t, r) => t + (r.gharama || 0), 0);

    const salio = makusanyo - jumlaMatumizi;

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(16);
    doc.setTextColor(27, 58, 63);
    doc.text("KIDEGEMBYE SECONDARY SCHOOL", 105, 18, { align: "center" });
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`TAARIFA YA HOSTEL - ${muhula.toUpperCase()}`, 105, 25, { align: "center" });
    doc.setFontSize(9);
    doc.setTextColor(80);
    doc.text(`Tarehe ya Ripoti: ${new Date().toLocaleDateString('en-GB')}`, 195, 33, { align: "right" });

    doc.autoTable({
        startY: 40,
        head: [["Summary ya Makusanyo", ""]],
        body: [
            ["Jumla ya Makusanyo Yaliyothibitishwa (Ada Hostel + Taaluma)", makusanyo.toLocaleString() + " TZS"],
            ["Jumla ya Matumizi Yaliyolipwa", jumlaMatumizi.toLocaleString() + " TZS"],
            ["SALIO LA MUHULA", salio.toLocaleString() + " TZS"],
            ["Idadi ya Wanafunzi Waliolipia", String(wanafunziMuhula.length)]
        ],
        theme: 'grid',
        headStyles: { fillColor: [5, 150, 105] }
    });

    let currentY = doc.lastAutoTable.finalY + 10;

    DARASA_ORDER.forEach(darasa => {
        const group = wanafunziMuhula.filter(d => d.darasa === darasa);
        if (group.length === 0) return;

        if (currentY > doc.internal.pageSize.height - 50) {
            doc.addPage();
            currentY = 20;
        }

        doc.setFontSize(11);
        doc.setTextColor(27, 58, 63);
        doc.text(`${darasa}  (Kila safu: Alicholipa (Deni))`, 14, currentY);

        doc.autoTable({
            startY: currentY + 3,
            head: [["Jina la Mwanafunzi", "Ada Hostel", "Ada Taaluma", "Mahindi", "Maharage", "Mchele", "Njia", "Status"]],
            body: group.map(d => [
                d.jina_mwanafunzi,
                formatCellWithDeni(d.ada_hostel, HOSTEL_REQUIRED.ada_hostel, true),
                formatCellWithDeni(d.ada_taaluma, HOSTEL_REQUIRED.ada_taaluma, true),
                formatCellWithDeni(d.mahindi, HOSTEL_REQUIRED.mahindi, false),
                formatCellWithDeni(d.maharage, HOSTEL_REQUIRED.maharage, false),
                formatCellWithDeni(d.mchele, HOSTEL_REQUIRED.mchele, false),
                d.njia_malipo || '-',
                d.status_mhasibu === 'approved' ? 'Approved' : 'Pending'
            ]),
            theme: 'striped',
            headStyles: { fillColor: [5, 150, 105] },
            styles: { fontSize: 8 },
            didParseCell: hostelDeniCellStyler
        });

        currentY = doc.lastAutoTable.finalY + 10;
    });

    if (matumiziMuhula.length > 0) {
        if (currentY > doc.internal.pageSize.height - 50) {
            doc.addPage();
            currentY = 20;
        }

        doc.setFontSize(11);
        doc.setTextColor(27, 58, 63);
        doc.text("Matumizi Yaliyoidhinishwa", 14, currentY);

        doc.autoTable({
            startY: currentY + 3,
            head: [["Tarehe", "Matumizi", "Gharama (TZS)", "Status Malipo"]],
            body: matumiziMuhula.map(r => [
                r.tarehe,
                r.jina,
                r.gharama.toLocaleString(),
                r.status_fedha === 'paid' ? 'Paid' : 'Wait for Payment'
            ]),
            theme: 'striped',
            headStyles: { fillColor: [5, 150, 105] },
            styles: { fontSize: 9 }
        });

        currentY = doc.lastAutoTable.finalY + 20;
    } else {
        currentY += 15;
    }

    if (currentY > doc.internal.pageSize.height - 40) {
        doc.addPage();
        currentY = 30;
    }

    doc.setFontSize(10);
    doc.setTextColor(50);
    doc.text("Msimamizi wa Hostel: ____________________", 14, currentY);
    doc.text("Mhasibu: ____________________", 90, currentY);
    doc.text("Head of School: ____________________", 150, currentY);

    addPdfFooter(doc);

    doc.save(`Hostel-Statement-${muhula.replace(/\s+/g,'-')}-${new Date().toISOString().split('T')[0]}.pdf`);
}

// ===== MHASIBU: TABS =====
function switchAccTab(tab) {
    const miradiSection = document.getElementById('accMiradiSection');
    const hostelSection = document.getElementById('accHostelSection');
    const tabMiradi = document.getElementById('accTabMiradi');
    const tabHostel = document.getElementById('accTabHostel');
    if (!miradiSection || !hostelSection) return;

    if (tab === 'hostel') {
        miradiSection.style.display = 'none';
        hostelSection.style.display = 'block';
        tabMiradi.classList.remove('active');
        tabHostel.classList.add('active');
        renderHostelAccountantDashboard();
        renderMashineAccountantSection();
    } else {
        miradiSection.style.display = 'block';
        hostelSection.style.display = 'none';
        tabHostel.classList.remove('active');
        tabMiradi.classList.add('active');
    }
}

// ===== MHASIBU: HOSTEL BALANCE + APPROVALS =====
function calculateHostelBalance() {
    const confirmedIncome = hostelMalipo
        .filter(d => d.status_mhasibu === 'approved')
        .reduce((t, d) => t + (d.ada_hostel || 0) + (d.ada_taaluma || 0), 0);

    const paidExpenses = hostelMatumizi
        .filter(r => r.status === 'approved' && r.status_fedha === 'paid')
        .reduce((t, r) => t + (r.gharama || 0), 0);

    hostelBalance = confirmedIncome - paidExpenses;
    return hostelBalance;
}

function renderHostelAccountantDashboard() {
    const balance = calculateHostelBalance();
    const balanceEl = document.getElementById('accHostelBalance');
    if (balanceEl) balanceEl.innerText = balance.toLocaleString() + " TZS";

    const muhulaSelect = document.getElementById('accHostelMuhulaSelect');
    const countEl = document.getElementById('accHostelStudentCount');
    if (muhulaSelect && countEl) {
        const selectedMuhula = muhulaSelect.value;
        const count = hostelMalipo.filter(d => d.muhula === selectedMuhula).length;
        countEl.innerText = count;
    }

    const pendingPaymentsTable = document.getElementById('accHostelPendingPaymentsTable');
    if (pendingPaymentsTable) {
        pendingPaymentsTable.innerHTML = '';
        hostelMalipo.filter(d => d.status_mhasibu === 'pending').forEach(d => {
            pendingPaymentsTable.innerHTML += `
                <tr>
                    <td>${d.tarehe}</td>
                    <td>${d.jina_mwanafunzi}</td>
                    <td>${d.darasa}</td>
                    <td>${d.muhula}</td>
                    <td>${(d.ada_hostel||0).toLocaleString()}</td>
                    <td>${(d.ada_taaluma||0).toLocaleString()}</td>
                    <td>${d.mahindi||0}</td>
                    <td>${d.maharage||0}</td>
                    <td>${d.mchele||0}</td>
                    <td><button onclick="approveHostelPayment('${d.id}')" style="background:#27ae60; color:white; border:none; padding:5px 12px; border-radius:4px; cursor:pointer; font-weight:bold;">Approve</button></td>
                </tr>`;
        });
    }

    const pendingExpensesTable = document.getElementById('accHostelPendingExpensesTable');
    if (pendingExpensesTable) {
        pendingExpensesTable.innerHTML = '';
        hostelMatumizi.filter(r => r.status === 'approved' && r.status_fedha === 'unpaid').forEach(r => {
            pendingExpensesTable.innerHTML += `
                <tr>
                    <td>${r.tarehe}</td>
                    <td>${r.jina}</td>
                    <td>${r.gharama.toLocaleString()}</td>
                    <td><button onclick="disburseHostelExpense('${r.id}')" style="background:#e67e22; color:white; border:none; padding:5px 12px; border-radius:4px; cursor:pointer; font-weight:bold;"> Cashout</button></td>
                </tr>`;
        });
    }
}

function approveHostelPayment(id) {
    firestore.collection('hostel_malipo').doc(id).update({ status_mhasibu: 'approved' })
      .then(() => alert("Malipo ya mwanafunzi yamethibitishwa!"))
      .catch(e => alert("Kosa: " + e.message));
}

function disburseHostelExpense(id) {
    let req = hostelMatumizi.find(r => r.id === id);
    if (!req) return;

    if (hostelBalance < req.gharama) {
        alert(`❌ Salio la Hostel halitoshi kutoa TZS ${req.gharama.toLocaleString()}!`);
        return;
    }

    firestore.collection('hostel_matumizi').doc(id).update({ status_fedha: 'paid' })
      .then(() => alert("Fedha imetolewa kikamilifu kwa ajili ya matumizi ya Hostel!"))
      .catch(e => alert("Kosa: " + e.message));
}

// ===== MAZIWA: WATEJA WA ORDER (MKOPO) =====
function addMazwaMteja() {
    const input = document.getElementById('mteja-jina-mpya');
    const jina = input.value.trim();
    if (!jina) { alert("Andika jina la mteja kwanza!"); return; }

    firestore.collection('maziwa_wateja').add({
        jina: jina,
        msimamizi: supervisors.maziwa || "Not-found",
        tarehe_created: new Date().toISOString().split('T')[0]
    }).then(() => {
        input.value = '';
        alert("✅ Customer Added to the List!");
    }).catch(e => alert("Kosa: " + e.message));
}

function deleteMazwaMteja(id) {
    if (confirm("⚠️ Kufuta mteja huyu hakutafuta oda zake za nyuma, lakini hataonekana tena kwenye list. Endelea?")) {
        firestore.collection('maziwa_wateja').doc(id).delete()
          .catch(e => alert("Kosa: " + e.message));
    }
}

function renderMazwaWatejaList() {
    const container = document.getElementById('mazwaWatejaListContainer');
    if (!container) return;
    if (maziwaWateja.length === 0) {
        container.innerHTML = `<p style="color:#999; font-size:0.9rem;">No any added customer</p>`;
        return;
    }
    container.innerHTML = `<div style="display:flex; flex-wrap:wrap; gap:8px;">` +
        maziwaWateja.map(m => `
            <span style="background:#eef2f7; padding:6px 12px; border-radius:20px; font-size:0.85rem; display:inline-flex; align-items:center; gap:8px;">
                ${m.jina}
                <button onclick="deleteMazwaMteja('${m.id}')" style="border:none; background:none; color:#e74c3c; cursor:pointer; font-weight:bold;">✕</button>
            </span>
        `).join('') + `</div>`;
}

function renderMazwaWatejaDropdowns() {
    const options = maziwaWateja.map(m => `<option value="${m.id}">${m.jina}</option>`).join('');
    ['oda-mteja-select', 'pdf-mteja-select', 'acc-mteja-select'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            const currentVal = el.value;
            el.innerHTML = maziwaWateja.length > 0 ? options : `<option value="">No-any</option>`;
            if (currentVal) el.value = currentVal;
        }
    });
}

function updateOdaKiasiPreview() {
    const lita = parseFloat(document.getElementById('oda-lita').value) || 0;
    document.getElementById('oda-kiasi-preview').value = (lita * MAZIWA_BEI_LITA).toLocaleString();
}

function submitMazwaOda() {
    const mtejaId = document.getElementById('oda-mteja-select').value;
    const tarehe = document.getElementById('oda-tarehe').value || new Date().toISOString().split('T')[0];
    const lita = parseFloat(document.getElementById('oda-lita').value) || 0;

    if (!mtejaId) { alert("Chagua Jina la mteja "); return; }
    if (lita <= 0) { alert("Weka idadi ya lita!"); return; }

    const mteja = maziwaWateja.find(m => m.id === mtejaId);
    const kiasi = lita * MAZIWA_BEI_LITA;

    firestore.collection('maziwa_oda').add({
        mteja_id: mtejaId,
        jina_mteja: mteja ? mteja.jina : "Not-found",
        tarehe: tarehe,
        lita: lita,
        bei: MAZIWA_BEI_LITA,
        kiasi: kiasi,
        msimamizi: supervisors.maziwa || "Not-found"
    }).then(() => {
        document.getElementById('oda-lita').value = '';
        document.getElementById('oda-kiasi-preview').value = '0';
        alert("✅ Bill Has been sent successifully to Head of School!");
    }).catch(e => alert("Kosa: " + e.message));
}

function renderHodMazwaOdaTable() {
    const tbody = document.getElementById('table-hod-maziwa-oda');
    if (!tbody) return;
    tbody.innerHTML = '';
    maziwaOda.slice(0, 50).forEach(d => {
        tbody.innerHTML += `
            <tr>
                <td>${d.tarehe}</td>
                <td>${d.jina_mteja}</td>
                <td>${d.lita}</td>
                <td>${d.kiasi.toLocaleString()}</td>
                <td>${d.msimamizi}</td>
            </tr>`;
    });
}

// ===== MHASIBU: KUREKODI MALIPO YA MTEJA =====
function recordMazwaWatejaPayment() {
    const mtejaId = document.getElementById('acc-mteja-select').value;
    const mwezi = document.getElementById('acc-malipo-mwezi').value;
    const kiasi = parseFloat(document.getElementById('acc-malipo-kiasi').value) || 0;
    const tarehe = document.getElementById('acc-malipo-tarehe').value || new Date().toISOString().split('T')[0];

    if (!mtejaId) { alert("Chagua Jina la mteja"); return; }
    if (!mwezi) { alert("Chagua mwezi!"); return; }
    if (kiasi <= 0) { alert("Weka kiasi kilicholipwa!"); return; }

    const mteja = maziwaWateja.find(m => m.id === mtejaId);

    firestore.collection('maziwa_malipo_wateja').add({
        mteja_id: mtejaId,
        jina_mteja: mteja ? mteja.jina : "Not-found",
        mwezi: mwezi,
        kiasi: kiasi,
        tarehe: tarehe
    }).then(() => {
        document.getElementById('acc-malipo-kiasi').value = '';
        alert("✅ Malipo yamerekodiwa na yameongezwa kwenye salio la Maziwa!");
    }).catch(e => alert("Kosa: " + e.message));
}

function renderAccMalipoWatejaTable() {
    const tbody = document.getElementById('table-acc-malipo-wateja');
    if (!tbody) return;
    tbody.innerHTML = '';
    maziwaMalipoWateja.slice(0, 30).forEach(d => {
        tbody.innerHTML += `
            <tr>
                <td>${d.tarehe}</td>
                <td>${d.jina_mteja}</td>
                <td>${d.mwezi}</td>
                <td>${d.kiasi.toLocaleString()}</td>
            </tr>`;
    });
}

// ===== PDF: RIPOTI YA MWEZI YA MTEJA (na Calendar Grid) =====
function printMazwaWatejaMonthlyReport() {
    const mtejaId = document.getElementById('pdf-mteja-select').value;
    const mwezi = document.getElementById('pdf-mwezi-select').value;

    if (!mtejaId) { alert("Chagua Jina la mteja"); return; }
    if (!mwezi) { alert("Chagua mwezi!"); return; }

    const mteja = maziwaWateja.find(m => m.id === mtejaId);
    const jinaMteja = mteja ? mteja.jina : "Not-found";

    const [year, month] = mwezi.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();

    const odaZaMwezi = maziwaOda.filter(o => o.mteja_id === mtejaId && o.tarehe.startsWith(mwezi));
    const ordersByDay = {};
    odaZaMwezi.forEach(o => {
        const day = parseInt(o.tarehe.split('-')[2], 10);
        ordersByDay[day] = (ordersByDay[day] || 0) + o.lita;
    });

    const totalLita = odaZaMwezi.reduce((t, o) => t + o.lita, 0);
    const totalKiasi = odaZaMwezi.reduce((t, o) => t + o.kiasi, 0);

    const malipoYaMwezi = maziwaMalipoWateja.filter(p => p.mteja_id === mtejaId && p.mwezi === mwezi);
    const jumlaMalipo = malipoYaMwezi.reduce((t, p) => t + p.kiasi, 0);
    const deniLinalobaki = totalKiasi - jumlaMalipo;

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(16);
    doc.setTextColor(31, 64, 104);
    doc.text("KIDEGEMBYE SECONDARY SCHOOL", 105, 18, { align: "center" });
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`RIPOTI YA MTEJA - MAZIWA (${mwezi})`, 105, 25, { align: "center" });
    doc.setFontSize(9);
    doc.setTextColor(80);
    doc.text(`Tarehe ya Ripoti: ${new Date().toLocaleDateString('en-GB')}`, 195, 33, { align: "right" });

    doc.autoTable({
        startY: 40,
        head: [["Jina la Customer: " + jinaMteja, ""]],
        body: [
            ["Jumla ya Lita Alizochukua", totalLita + " Lita"],
            ["Kiasi Anachodaiwa (Bei: TZS " + MAZIWA_BEI_LITA + "/Lita)", totalKiasi.toLocaleString() + " TZS"]], 
        theme: 'grid',
        headStyles: { fillColor: [31, 64, 104] }
    });

    let currentY = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(11);
    doc.setTextColor(31, 64, 104);
    doc.text("Kalenda ya Oda kwa kila Siku: 'taken' = alichukua, 'not taken' = hakuchukua", 14, currentY);
    currentY += 5;

    const calendarRows = [];
    let week = [];
    for (let day = 1; day <= daysInMonth; day++) {
        const lita = ordersByDay[day];
        const cellText = lita ? `${day}\ntaken (${lita}lt)` : `${day}\nnot taken`;
        week.push(cellText);
        if (week.length === 7) { calendarRows.push(week); week = []; }
    }
    if (week.length > 0) {
        while (week.length < 7) week.push('');
        calendarRows.push(week);
    }

    doc.autoTable({
        startY: currentY,
        body: calendarRows,
        theme: 'grid',
        showHead: 'never',
        styles: { halign: 'center', valign: 'middle', minCellHeight: 16, fontSize: 8 },
        didParseCell: function(data) {
            const raw = String(data.cell.raw);
            if (raw.includes('taken (')) {
                data.cell.styles.textColor = [39, 174, 96];
                data.cell.styles.fontStyle = 'bold';
                data.cell.styles.fillColor = [235, 250, 240];
            } else if (raw.includes('not taken')) {
                data.cell.styles.textColor = [150, 150, 150];
            }
        }
    });

    currentY = doc.lastAutoTable.finalY + 20;
    if (currentY > doc.internal.pageSize.height - 30) {
        doc.addPage();
        currentY = 30;
    }

    doc.setFontSize(10);
    doc.setTextColor(50);
    doc.text("Msimamizi wa Maziwa: ____________________", 110, currentY);

    addPdfFooter(doc);

    doc.save(`Ripoti-Mteja-${jinaMteja.replace(/\s+/g,'-')}-${mwezi}.pdf`);
}

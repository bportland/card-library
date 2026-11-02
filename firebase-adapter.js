// Thin wrapper around Firebase so app.js only deals with paths and plain objects.
// This config identifies the project and is public by design. Access is enforced
// by the Firestore security rules, which allow only the two listed accounts.
import {initializeApp} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {getAuth,GoogleAuthProvider,signInWithPopup,signInWithRedirect,signOut,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {initializeFirestore,getFirestore,persistentLocalCache,persistentMultipleTabManager,collection,doc,setDoc,updateDoc,deleteDoc,onSnapshot,writeBatch} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const firebaseConfig={
  apiKey:'AIzaSyBemMQRK5JcKGf-zXNVaJKskhl3t0YVi90',
  authDomain:'card-library-bpmp.firebaseapp.com',
  projectId:'card-library-bpmp',
  storageBucket:'card-library-bpmp.firebasestorage.app',
  messagingSenderId:'123030651517',
  appId:'1:123030651517:web:f402281f2c445dc0c96714'
};

const app=initializeApp(firebaseConfig);
const fbAuth=getAuth(app);
let fs;
try{fs=initializeFirestore(app,{localCache:persistentLocalCache({tabManager:persistentMultipleTabManager()})})}
catch{fs=getFirestore(app)}

const wrap=ref=>({
  id:ref.id,
  set:data=>setDoc(ref,data),
  update:data=>updateDoc(ref,data),
  delete:()=>deleteDoc(ref)
});
const BATCH_SIZE=400;

export const db={
  doc:path=>wrap(doc(fs,path)),
  collection:name=>({
    doc:id=>wrap(id?doc(fs,name,id):doc(collection(fs,name))),
    onSnapshot:(next,error)=>onSnapshot(collection(fs,name),{includeMetadataChanges:true},next,error)
  }),
  // ops: [{path, set}] or [{path, update}]
  async batch(ops,onProgress){
    for(let i=0;i<ops.length;i+=BATCH_SIZE){
      const b=writeBatch(fs);
      for(const op of ops.slice(i,i+BATCH_SIZE)){
        if(op.set)b.set(doc(fs,op.path),op.set);else b.update(doc(fs,op.path),op.update);
      }
      await b.commit();
      onProgress?.(Math.min(i+BATCH_SIZE,ops.length));
    }
  }
};

export const auth={
  onChange:fn=>onAuthStateChanged(fbAuth,fn),
  async signIn(){
    const provider=new GoogleAuthProvider();
    try{await signInWithPopup(fbAuth,provider)}
    catch(e){
      if(e.code==='auth/popup-blocked')await signInWithRedirect(fbAuth,provider);
      else throw e;
    }
  },
  signOut:()=>signOut(fbAuth)
};

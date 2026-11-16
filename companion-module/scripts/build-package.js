'use strict'
// Build the exact self-contained distribution that Companion imports.
// No network dependency or npm install is required for this release.
const fs=require('node:fs')
const path=require('node:path')
const os=require('node:os')
const {spawnSync}=require('node:child_process')
const root=path.resolve(__dirname,'..')
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'))
const manifest=JSON.parse(fs.readFileSync(path.join(root,'companion/manifest.json'),'utf8'))
if(pkg.version!==manifest.version)throw new Error(`Version mismatch: ${pkg.version} / ${manifest.version}`)
if(manifest.id!=='jc-av-timer'||manifest.name!=='JC - AV Timer')throw new Error('Module identity changed')
if(manifest.runtime.entrypoint!=='../main.js')throw new Error('Unexpected manifest entrypoint')
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'jc-avtimer-build-'))
const staged=path.join(temp,'pkg')
fs.mkdirSync(staged,{recursive:true})
for(const f of ['main.js','shim.js','LICENSE']) fs.copyFileSync(path.join(root,f),path.join(staged,f))
for(const folder of ['src','companion','web']){
  fs.cpSync(path.join(root,folder),path.join(staged,folder),{recursive:true,filter:p=>!p.includes('node_modules')})
}
fs.writeFileSync(path.join(staged,'package.json'),JSON.stringify({name:pkg.name,version:pkg.version,license:pkg.license,type:'commonjs'},null,2)+'\n')
const output=path.resolve(root,'../downloads',`JC-AV-Timer-Companion-v${pkg.version}.tgz`)
fs.mkdirSync(path.dirname(output),{recursive:true})
// --format=ustar produces Companion-compatible pkg/... entries.
const result=spawnSync('tar',['-czf',output,'-C',temp,'pkg'],{encoding:'utf8'})
fs.rmSync(temp,{recursive:true,force:true})
if(result.status!==0)throw new Error('tar packaging failed: '+result.stderr)
const inspect=spawnSync('tar',['-tzf',output],{encoding:'utf8'})
if(inspect.status!==0||!inspect.stdout.includes('pkg/companion/manifest.json')||!inspect.stdout.includes('pkg/main.js')){
  throw new Error('Distribution missing manifest or entrypoint')
}
console.log(`Built ${output} (${fs.statSync(output).size} bytes)`)

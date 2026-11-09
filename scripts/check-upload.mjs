import {execFileSync} from 'node:child_process';
import path from 'node:path';
const root=process.cwd();
const git=(...args)=>execFileSync('git',['-c',`safe.directory=${root.replaceAll('\\','/')}`,...args],{encoding:'utf8',maxBuffer:8*1024*1024});
const files=git('ls-files','--cached','-z').split('\0').filter(Boolean);
const allowed=new Set(['.ts','.css','.html','.json','.js','.mjs','.cjs','.ps1','.cmd','.md','.txt','.py']);
const special=new Set(['.gitignore','.gitattributes','.dockerignore','Dockerfile','LICENSE','NOTICE']);
const issues=[];
for(const file of files){
 if(/(^|\/)(\.local|node_modules|dist|credentials|screenshots|previews|\.aws|\.git)(\/|$)/i.test(file)||(!allowed.has(path.extname(file).toLowerCase())&&!special.has(file))){issues.push(`${file}: non-source or private asset`);continue;}
 const text=git('show',`:${file}`);
 if(/gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text))issues.push(`${file}: credential material`);
 if(/(?<![A-Za-z])[A-Za-z]:[\\/]/.test(text))issues.push(`${file}: machine-specific absolute path`);
 if(/"BLOCK_RECORD"\s*:\s*\{|"ownerBlockRecordSoftId"\s*:/.test(text))issues.push(`${file}: extracted drawing database`);
}
if(!files.length)throw new Error('No staged project files to inspect.');
if(issues.length){console.error('Upload check blocked:\n'+issues.join('\n'));process.exitCode=1;}else console.log(`Upload check passed: ${files.length} source/document files; no drawings, private assets or detected credentials.`);

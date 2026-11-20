'use strict';
const fs=require('node:fs'),path=require('node:path'),E=require('../src/engine.js'),CM=require('../src/color-management.js');
const destination=process.argv[2];
if(!destination)throw Error('Expected generated header path');
const rows=Object.entries(E.LOOKS).map(([key,v])=>
 '    {"'+key+'", {'+v.shadow.join(',')+'}, {'+v.highlight.join(',')+'}, '+v.sat+', '+v.contrast+'}');
const stocks=Object.entries(E.STOCKS).map(([key,v])=>
 '    {"'+key+'", {'+v.curve.join(',')+'}, {'+v.sat.join(',')+'}, {'+v.shadow.join(',')+'}, {'+v.highlight.join(',')+'}, {'+v.hue.join(',')+'}}');
const text='// Generated from src/engine.js. Do not edit.\n#pragma once\n#include <array>\n'+
 'struct Look { const char* key; std::array<double,2> shadow, highlight; double saturation, contrast; };\n'+
 'inline constexpr std::array<Look,'+rows.length+'> kLooks{{\n'+rows.join(',\n')+'\n}};\n'+
 'struct Stock { const char* key; std::array<double,3> curve, sat; std::array<double,2> shadow, highlight; std::array<double,3> hue; };\n'+
 'inline constexpr std::array<Stock,'+stocks.length+'> kStocks{{\n'+stocks.join(',\n')+'\n}};\n';
fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,text);
const profiles=Object.entries(CM.PROFILES).map(([key,p])=>
 '    {"'+key+'", '+p.transfer+', '+p.scene+', {'+p.matrix.join(',')+'}}');
const profileText='// Generated from src/color-management.js. Do not edit.\n#pragma once\n#include <array>\n'+
 'struct InputProfile { const char* key; int transfer; bool scene; std::array<double,9> matrix; };\n'+
 'inline constexpr std::array<InputProfile,'+profiles.length+'> kInputProfiles{{\n'+profiles.join(',\n')+'\n}};\n';
fs.writeFileSync(path.join(path.dirname(destination),'profiles.hpp'),profileText);

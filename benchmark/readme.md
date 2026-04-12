# Template Engine Benchmark

This project is a benchmark designed to evaluate the performance of various JavaScript template engines. It allows developers to compare rendering performance of several popular template engines in various scenarios.

## How to use ?

**1. Clone this repo on your machine:**
```bash
git clone https://github.com/itsarnaud/templating-engine-bench.git
```

**2. Install dependencies:**
```bash
npm install
```

**3. Launch the benchmark by executing:**
```bash
node main.js
```

**4. Results:<br/>**
Once the benchmark is completed, the results will be automatically updated in the readme file.

## Current results

The tests were carried out on:
- Node v21.7.2
- MacBook Air M2, 15-inch with 16GB of RAM (2023)

<!-- <render performance> -->
## RENDER 

### friends (runned 2000 times) 
`pug` => **342ms** <br/> 
`eta` => **349ms** <br/> 
`igodust` => **397ms** <br/> 
`astro` => **487ms** <br/> 
`handlebars` => **1052ms** <br/> 
`dustjs` => **1159ms** <br/> 
`ejs` => **2733ms** <br/> 
`liquidjs` => **12872ms** <br/> 

### if-expression (runned 2000 times) 
`astro` => **3ms** <br/> 
`pug` => **7ms** <br/> 
`dustjs` => **8ms** <br/> 
`igodust` => **9ms** <br/> 
`eta` => **51ms** <br/> 
`ejs` => **77ms** <br/> 
`liquidjs` => **82ms** <br/> 

### projects-escaped (runned 2000 times) 
`astro` => **21ms** <br/> 
`igodust` => **33ms** <br/> 
`handlebars` => **34ms** <br/> 
`dustjs` => **37ms** <br/> 
`eta` => **65ms** <br/> 
`pug` => **97ms** <br/> 
`ejs` => **121ms** <br/> 
`liquidjs` => **134ms** <br/> 

### projects-unescaped (runned 2000 times) 
`igodust` => **9ms** <br/> 
`dustjs` => **13ms** <br/> 
`astro` => **18ms** <br/> 
`handlebars` => **31ms** <br/> 
`eta` => **67ms** <br/> 
`pug` => **89ms** <br/> 
`ejs` => **123ms** <br/> 
`liquidjs` => **130ms** <br/> 

### search-results (runned 2000 times) 
`igodust` => **36ms** <br/> 
`pug` => **39ms** <br/> 
`astro` => **56ms** <br/> 
`dustjs` => **86ms** <br/> 
`eta` => **90ms** <br/> 
`handlebars` => **122ms** <br/> 
`ejs` => **391ms** <br/> 
`liquidjs` => **1181ms** <br/> 

### simple-0 (runned 2000 times) 
`dustjs` => **1ms** <br/> 
`astro` => **2ms** <br/> 
`pug` => **2ms** <br/> 
`igodust` => **6ms** <br/> 
`handlebars` => **8ms** <br/> 
`liquidjs` => **15ms** <br/> 
`ejs` => **25ms** <br/> 
`eta` => **31ms** <br/> 

### simple-1 (runned 2000 times) 
`astro` => **4ms** <br/> 
`pug` => **8ms** <br/> 
`igodust` => **9ms** <br/> 
`dustjs` => **11ms** <br/> 
`handlebars` => **17ms** <br/> 
`eta` => **51ms** <br/> 
`liquidjs` => **96ms** <br/> 
`ejs` => **108ms** <br/> 

### simple-2 (runned 2000 times) 
`astro` => **4ms** <br/> 
`pug` => **7ms** <br/> 
`dustjs` => **9ms** <br/> 
`igodust` => **9ms** <br/> 
`handlebars` => **13ms** <br/> 
`eta` => **54ms** <br/> 
`liquidjs` => **91ms** <br/> 
`ejs` => **98ms** <br/> 

<!-- <end> -->

## Adding a new Template Engine

To add a new template engine to this project, follow these simple steps:

**1. Create a file for the template engine:<br/>**
In the `engines` directory, create a new file named after your template engine, for example `my-engine.js`. Take a look at the files already created for the syntax.

```
engines
 ├── igodust.js
 ├── my-engine.js
 └── ...
```
**⚠️ WARNING: Asynchronous rendering methods, such as those returning Promises, are not supported by the benchmarking tool at the moment. Ensure that your rendering method is synchronous to work with the benchmarking tool effectively. ⚠️**

**2. Add test templates: <br/>**
Place your template files in the templates directory, following the existing structure. Each test group should have a data file (.js or .json) and template files for each template engine you want to include in the benchmark.

```
templates
 ├── group1
 │   ├── data.js (or json)
 │   ├── template.dust
 │   ├── template.my-engine
 │   └── ...
 └── ...
```

 And that's it, all you have to do is launch the benchmark!

 PRs are welcome 😃❤️

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
`astro` => **198ms** <br/> 
`eta` => **200ms** <br/> 
`pug` => **209ms** <br/> 
`igodust` => **269ms** <br/> 
`handlebars` => **607ms** <br/> 
`dustjs` => **616ms** <br/> 
`ejs` => **1627ms** <br/> 
`liquidjs` => **7707ms** <br/> 

### if-expression (runned 2000 times) 
`astro` => **1ms** <br/> 
`pug` => **4ms** <br/> 
`dustjs` => **6ms** <br/> 
`igodust` => **6ms** <br/> 
`eta` => **30ms** <br/> 
`ejs` => **46ms** <br/> 
`liquidjs` => **48ms** <br/> 

### projects-escaped (runned 2000 times) 
`astro` => **12ms** <br/> 
`handlebars` => **20ms** <br/> 
`igodust` => **21ms** <br/> 
`dustjs` => **23ms** <br/> 
`eta` => **41ms** <br/> 
`pug` => **59ms** <br/> 
`ejs` => **74ms** <br/> 
`liquidjs` => **83ms** <br/> 

### projects-unescaped (runned 2000 times) 
`igodust` => **5ms** <br/> 
`dustjs` => **8ms** <br/> 
`astro` => **11ms** <br/> 
`handlebars` => **20ms** <br/> 
`eta` => **41ms** <br/> 
`pug` => **60ms** <br/> 
`ejs` => **75ms** <br/> 
`liquidjs` => **81ms** <br/> 

### search-results (runned 2000 times) 
`igodust` => **8ms** <br/> 
`pug` => **23ms** <br/> 
`astro` => **30ms** <br/> 
`dustjs` => **53ms** <br/> 
`eta` => **56ms** <br/> 
`handlebars` => **74ms** <br/> 
`ejs` => **246ms** <br/> 
`liquidjs` => **737ms** <br/> 

### simple-0 (runned 2000 times) 
`astro` => **1ms** <br/> 
`dustjs` => **1ms** <br/> 
`pug` => **1ms** <br/> 
`handlebars` => **5ms** <br/> 
`igodust` => **6ms** <br/> 
`ejs` => **14ms** <br/> 
`liquidjs` => **15ms** <br/> 
`eta` => **16ms** <br/> 

### simple-1 (runned 2000 times) 
`pug` => **4ms** <br/> 
`astro` => **5ms** <br/> 
`igodust` => **6ms** <br/> 
`handlebars` => **11ms** <br/> 
`dustjs` => **12ms** <br/> 
`eta` => **31ms** <br/> 
`liquidjs` => **57ms** <br/> 
`ejs` => **75ms** <br/> 

### simple-2 (runned 2000 times) 
`astro` => **3ms** <br/> 
`pug` => **4ms** <br/> 
`dustjs` => **5ms** <br/> 
`igodust` => **6ms** <br/> 
`handlebars` => **8ms** <br/> 
`eta` => **32ms** <br/> 
`liquidjs` => **54ms** <br/> 
`ejs` => **59ms** <br/> 

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

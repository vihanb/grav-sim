window.Trails = false;
// STANDARDS:
// measure: radius 100KMs
// measure: dist 1,000,000KMs
// measure: planet_mass earth masses

const GAMMA_GRAV_CONST = 1; // Makes things waaay simpler for now
const SQRT = Math.sqrt;
const ABS = Math.abs;
const POW = Math.pow;

const STAR_SHRINK_FACTOR = 150;
const PLANET_SHRINK_FACTOR = 50;

const DIST_SHRINK_FACTOR = 10;
const DIST_QUAD_FACTOR = 1.005;

const MASS_ADJUST_FACTOR = 1e4; // Use to adjust speed and scale

const GRAV_CONST  = 6.67408;
const f = 1; // speed up factor;

class Coord { constructor(x,y) { this.x = x; this.y = y; } }
class Planet {
    constructor(radius, mass, coord, velocityX, velocityY, color) {
        this.radius = radius; this.mass = mass;
        this.x = coord.x;
        this.y = coord.y;
        this.velocityX = velocityX;
        this.velocityY = velocityY;
        this.color = color;
        console.log("New Body: ", this);
    }

    roche(moon) {
        return 126 * this.radius * Math.pow(this.mass / moon.mass, 1/3)
    }

    // Returns F_G through the fact that GMm/d^2 == (Mm*10^-8)/d^2
    // Account for Gamma_G through: [radius * 10^3, dist * 10^7 ]
    grav(satellite) {
        // This needs to be lighting fast
        return (GAMMA_GRAV_CONST * this.mass) *
            Math.pow(this.x - satellite.x, 2) + Math.pow(this.y - satellite.y, 2)
    }
    // G*M_2
    dist(moon) {
        return POW(this.x - moon.x, 2) + POW(this.y - moon.y, 2);
    }
}

const Empty = () => void 0;

function toHTML(html) {
    let template = document.createElement('template');
    template.innerHTML = html;
    return template.content.firstChild;
}

function GenerateOptionList(title, opts) {
    let item = document.getElementById("control-options");
    item.innerHTML = `<h2>${title}</h2>`;
    let olist = [];
    opts.forEach((i) => {
        let hold = document.createElement("div");
        if (i[0])
            hold.innerHTML += `<label>${i[0]}:</label> `;
        let a = toHTML(i[1]);
        let b = document.createElement('span');
        b.className = "opt-desc";
        olist.push(a);
        if (i[2]) {
            a[i[2]] = () => {
                if (i[3]) i[3](a, olist);
                if (i[4]) b.innerHTML = i[4](a, olist);
            };
        }

        if (i[4]) b.innerHTML = i[4](a);
        hold.appendChild(a);
        hold.appendChild(b);
        item.appendChild(hold);
        if (i[5]) i[5](a);
    });
    return item;
}

function AddControl(opt, icon, cl, run, after) {
    let h = document.createElement("div");
    cl = cl.replace(/]|"/g, "\\$&")
    h.className = "control-panel-item" + (cl ? " " + cl : "");
    h.innerHTML = `<img src="${icon}">&nbsp; <span>${opt}</span>`;
    h.dataset.PLANET_NAME = cl;
    h.onclick = run ? function() {
        run(() => {
            h.parentNode.removeChild(h);
            CloseControl();
        })
    } : () => void 0; 
    //    let ref_node = document.querySelector(`[PLANET_NAME="${cl}"]`);
    //    .parentNode.insertBefore(newNode, referenceNode.nextSibling);
    document.getElementById("control-panel").appendChild(h);
    return h;
}
function CloseControl() {
    document.getElementById("control-options").innerHTML = "";
}

window.onload = function() {
    let Sun = new Planet(6968, 1989000000 / MASS_ADJUST_FACTOR,
                         new Coord(0,0)); // It's not really a planet but w/e ¯\_(ツ)_/¯ 
    let Planets = new Map();

    let DEBUG = 0;

    /*== SOME IMPORTANT STUFF ==*/
    const canvas = document.getElementById("preview");

    /*== SETUP ==*/
    let Control_Sun = AddControl('Sun', 'icons/sun.png', 'sun-control', () => GenerateOptionList('Configure Sun...', [
        ["Mass", `<input type="range" min="596700" max="696150000" step="100" defaultValue="1989000">`, 'oninput',
         item => Sun.mass = item.value,
         item => `<b>${item.value.replace(/\B(?=(.{3})+$)/g, ',')},000,000,000,000,000,000</b> kg`],
        ["Radius", `<input type="range" min="4500" max="12000" step="10" defaultValue="6968">`, 'oninput',
         item => Sun.radius = item.value,
         item => `about <b>${item.value}00</b>km`]

    ]));

    /*
              300     000,000,000,000,000,000
              328 500 000 000 000 000 000 000
            5 972 000 000 000 000 000 000 000
        1 898 000 000 000 000 000 000 000 000
    1 989 000 000 000 000 000 000 000 000 000

      596,700 000 000 000 000 000 000 000 000
    1,989,000 000 000 000 000 000 000 000 000

    */

    const DELTA_V_LIMITS = 75;

    let Control_Add = AddControl('Add Planet', 'icons/plus.png', 'add-ctrl', () => GenerateOptionList('Add Planet...', [
        ["Planet Name", `<input type="text" value="Planet ${Planets.size + 1}">`],
        ["Mass", `<input type="range" min="300" max="1898000" step="10" defaultValue="5972">`, 'oninput',,
         item => `<b>${item.value.replace(/\B(?=(.{3})+$)/g, ',')},000 trillion kg`],
        ["Radius", `<input type="range" min="15" max="450" step="1" defaultValue="49">`, 'oninput',,
         item => `<b>${item.value}00</b> km`],
        ["Distance", `<input type="range" min="30" max="3000" step="1" defaultValue="93">`, 'oninput',,
         item => `<b>${item.value}</b> million km`],
        ["Initial &Delta;V",
         `<input type="range" min="0" max="${DELTA_V_LIMITS * 2}" step="1" value="${DELTA_V_LIMITS + 37}">`,
         'oninput',, item => `<b>${Math.abs(item.value - 75)}</b> km/s`],
        ["Color", `<input type='text'>`, 'onchange',,, init => new jscolor(init).fromString('00f')],
        ["", `<button>Add Planet</button>`, 'onclick',
         (item, all) => {
             if (all[0].value && !Planets.has(all[0].value)) {
                 Planets.set(all[0].value, new Planet(+all[2].value, +all[1].value / MASS_ADJUST_FACTOR, new Coord(
                     -all[3].value,
                     0
                 ), 0, all[4].value - DELTA_V_LIMITS, all[5]._jscLinkedInstance.toHEXString()));

                 AddControl(all[0].value, '', 'mod-'+all[0].value, (delself) =>
                            GenerateOptionList(`Modify ${all[0].value}...`, [
                     ["", `<button>Delete Planet</button>`, 'onclick',
                      () => {Planets.delete(all[0].value);delself()}],
                     ["", `<button>Add Moon</button>`, 'onclick',
                      () => {
                          /*
                       73 476 730 900
                                  v scale cut-off
                          148 190 000 000 000 000 000 000 ganymede
                                      476 200 000 000 000 smallest
                                  000,000,000,000,000,000
                           73 476 730 900 000 000 000 000 moon
                                  000,000,000,000,000,000
                           476 148,190,000,000
                          */
                          GenerateOptionList('Add Moon for ' + all[0].value, [
                              ["Moon Name", `<input type="text" value="Moon ${Planets.size}">`],
                              ["Mass",
                               `<input type="range" min="476" max="148190000000" default="73476730900">`, 'oninput',,
                               item => `<b>${item.value}</b> trillion kg`],
                              ["Radius", `<input type="range" min="3" max="5000" default="1737">`, 'oninput',,
                               item => `<b>${item.value}</b>km`],
                              ["Distance", `<input type="range" min="90" max="15000" default="3703">`, 'oninput',,
                               item => `<b>${(item.value+"00").replace(/\B(?=(.{3})+$)/g, ',')}km</b>`],
                              ["Color", `<input type='text'>`, 'onchange',,,
                               init => new jscolor(init).fromString('aaa')],
                              ["&Delta;V<sub>y</sup>",
                               `<input type="range" min="0.1" max="15" value="1.02" step="0.01">`, 'oninput',,
                               item => `<b>${item.value}</b>km/s`],
                              ["&Delta;V<sub>x</sup>",
                               `<input type="range" min="0.1" max="15" value="1.02" step="0.01">`, 'oninput',,
                               item => `<b>${item.value}</b>km/s`],
                              ["", `<button>Add Moon</button>`, 'onclick',
                               (p, a) => {
                                   // Scales:
                                   // Mass / 1e3
                                   // radius / 100
                                   // (distance + "00") / 1e9
                                   if (a[0].value && !Planets.has(a[0].value)) {
                                       let pl = Planets.get(all[0].value);

                                       // sqrt(Gm*(2/r - 1/a))
                                       // Tangent vector is:
                                       //   (pl.velocityX, pl.velocityY)
                                       // Equation is:
                                       //   v = Math.sqrt(f*pl.mass*
                                       //     (2/Math.sqrt(Math.pow(pl.x - pl.x + ((a[3].value + "00") / 1e4), 2))
                                       //      - 1/a)
                                       //   )
                                       //   where `v` would become the magnitude of the vector

                                       let sm_axis = (a[3].value + "00") / 1e4;
                                       let v_op = Math.sqrt(Math.pow(pl.velocityX, 2) + Math.pow(pl.velocityY, 2));
                                       let v_mag = Math.sqrt(
                                           f * pl.mass * (
                                               1 / sm_axis
                                           )
                                       );
                                       console.log(v_mag,
                                                   v_mag * Math.cos(pl.velocityX / v_op),
                                                   v_mag * Math.sin(pl.velocityY / v_op));
                                       Planets.set(a[0].value, new Planet(
                                           a[2].value / 100, a[1].value / 1e6 / MASS_ADJUST_FACTOR, new Coord(
                                               pl.x + ((a[3].value + "00") / 1e4), // 1e9
                                               pl.y
                                           ),
                                           // Moon vectors components
                                           //v_mag * Math.cos(-v_op / pl.velocityX),
                                           //v_mag * Math.sin(-v_op / pl.velocityY),
                                           pl.velocityX,
                                           pl.velocityY + (+a[5].value),

                                           a[4]._jscLinkedInstance.toHEXString()));

                                       AddControl(a[0].value, '', 'mod'+a[0].value, (deself) => {
                                           GenerateOptionList(`Modify ${a[0].value}`, [
                                               ["", `<button>Delete Planet</button>`, 'onclick',
                                                () => {Planets.delete(a[0].value);delself()}]
                                           ]);
                                       }, all[0].value);
                                   } else {
                                       alert("That planet/moon name is either already taken or blank");
                                   }
                               }]
                          ]);
                      }
                     ]

                 ]));
                 CloseControl();
             } else {
                 alert("That planet/moon name is either already taken or blank");
             }
         }]
    ]));

    /*== CANVAS SETUP ==*/
    const ctx = canvas.getContext('2d');

    const DPR = window.devicePixelRatio || 1;

    //if (DPR > 1) {
    //    canvas.style.width = canvas.style.width// + "px";
    //    canvas.style.height = canvas.style.height// + "px";
    //
    //    canvas.width *= DPR;
    //    canvas.height *= DPR;
    //
    //    ctx.scale(DPR, DPR);
    //}

    // Assets
    const AssetStar = new Image();
    AssetStar.src = 'icons/planet_sun.png';

    let TRAILS = [];

    (function Render() {
        let CH = canvas.height;
        let CW = canvas.width;
        let size = (Sun.radius / STAR_SHRINK_FACTOR) * 2;

        ctx.clearRect(0, 0, canvas.width, canvas.height); // comment out for debugging

        ctx.drawImage(AssetStar,
                      (canvas.width / 2)  - (size / 2),
                      (canvas.height / 2) - (size / 2),
                      size, size
                     );

        Planets.forEach((planet, name) => {
            if (planet) {
                ctx.beginPath();

                ctx.arc(
                    (canvas.width / 2)  + (planet.x / DIST_SHRINK_FACTOR),
                    (canvas.height / 2) + (planet.y / DIST_SHRINK_FACTOR),
                    planet.radius / PLANET_SHRINK_FACTOR, 0, 2 * Math.PI, false
                );

                ctx.fillStyle = planet.color;
                ctx.fill();

                if (window.Trails) {
                    TRAILS.forEach(trail => {
                        ctx.fillStyle = trail[2];
                        ctx.fillRect(trail[0], trail[1], 1, 1);
                    });

                    let hex = +planet.color.slice(1);
                    TRAILS.push([
                        (canvas.width / 2)  + (planet.x / DIST_SHRINK_FACTOR),
                        (canvas.height / 2) + (planet.y / DIST_SHRINK_FACTOR),
                        planet.color
                    ]);

                    TRAILS = TRAILS.slice(-1000);
                }

                /*
f = 0.1 #twiddle factor
force = body2.mass / ( (body1.x - body2.x)**2 + (body1.y - body2.y)**2 )

body1.xv += f * force * (body2.x - body1.x)
body1.yv += f * force * (body2.y - body1.y)

body1.x += f * body1.xv
body1.y += f * body1.yv

                */

                //let DF = Sun.dist(planet);
                var dx = planet.x - Sun.x;
                let dy = planet.y - Sun.y;
                let dist = Math.pow(dx, 2) + Math.pow(dy, 2);

                let grav = 10 * f * Sun.mass / dist;

                planet.velocityX -= grav * (dx / Math.sqrt(dist));
                planet.velocityY -= grav * (dy / Math.sqrt(dist));

                Planets.forEach((p2, n) => {
                    if (n !== name) {
                        let dx = planet.x - p2.x;
                        let dy = planet.y - p2.y;
                        let dist = Math.pow(dx, 2) + Math.pow(dy, 2);

                        let grav = 10 * f * p2.mass / dist;

                        planet.velocityX -= grav * (dx / Math.sqrt(dist));
                        planet.velocityY -= grav * (dy / Math.sqrt(dist));
                    }
                });

                //Planets.set(name, planet)
            }
        });

        Planets.forEach((planet, name) => {
            planet.x += f * planet.velocityX;
            planet.y += f * planet.velocityY;
            //Planets.set(name, planet)
        });

        window.requestAnimationFrame(Render);
    }());

    //canvas.addEventListener("resize", () => {
    //    Sun.x = canvas.width / 2 - (Sun.radius / STAR_SHRINK_FACTOR);
    //    Sun.y = canvas.height / 2 - (Sun.radius / STAR_SHRINK_FACTOR);
    //}, false);
    new CanvasResizer(canvas);
    //Sun.x = canvas.width / 2 - (Sun.radius / STAR_SHRINK_FACTOR);
    //Sun.y = canvas.height / 2 - (Sun.radius / STAR_SHRINK_FACTOR);
};
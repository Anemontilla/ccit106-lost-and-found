/** Session-based authentication guards (replace Django @login_required) */
module.exports.requireLogin = function requireLogin(req, res, next) {
    if (!req.session || !req.session.user) {
        return res.status(401).json({ error: 'Login required' });
    }
    next();
};

module.exports.requireManagement = function requireManagement(req, res, next) {
    if (!req.session || !req.session.user) {
        return res.status(401).json({ error: 'Login required' });
    }
    if (req.session.user.role !== 'Management' && !req.session.user.is_staff) {
        return res.status(403).json({ error: 'Management access required' });
    }
    next();
};

module.exports.requireAdmin = function requireAdmin(req, res, next) {
    if (!req.session || !req.session.user) {
        return res.status(401).json({ error: 'Login required' });
    }
    if (!req.session.user.is_staff) {
        return res.status(403).json({ error: 'Administrator access required' });
    }
    next();
};